/**
 * A fixture-backed `window.cockpit`.
 *
 * src/backend/cockpit-runtime.ts resolves the bare "cockpit" specifier to
 * `window.cockpit`, and eslint.config.js stops anything outside src/backend/
 * reaching that global by any other route. Installing a different object here,
 * before the plugin bundle runs, therefore replaces the entire outside world in
 * one move: the real IncusDriver, IncusClient and envelope parsing all run, and
 * the page is rendered from a server response rather than from a hand-built prop
 * tree.
 *
 * Typed as CockpitApi from src/types/cockpit.d.ts rather than as a structural
 * approximation of it. That file is the plugin's hand-maintained declaration of
 * the base1 surface, so `npm run typecheck` is what keeps the two in step: a
 * method the plugin starts calling fails to compile here until this answers it.
 */

/** One canned HTTP response. */
interface FixtureResponse {
    status: number;
    /** The response body verbatim, envelope included. */
    body: string;
    headers?: Record<string, string>;
}

/** One canned subprocess result, keyed by the joined argv. */
interface FixtureProcess {
    /** Resolved output. Ignored when `problem` is set. */
    output?: string;
    /** Rejects the process with this Cockpit problem string. */
    problem?: string;
    /**
     * Never settles and never streams. This is what `incus monitor` does while
     * it is working, and a promise that resolves would put the event stream into
     * its reconnect loop for the wrong reason.
     */
    hang?: boolean;
}

export interface HarnessBundle {
    /** Keyed by "<METHOD> <path>", path including its query string. */
    responses: Record<string, FixtureResponse>;
    /** Keyed by the argv joined with single spaces. */
    processes: Record<string, FixtureProcess>;
    /** What `cockpit.permission({ admin: true })` settles on. */
    permission: { allowed: boolean };
    /** Lines the terminal channel emits once, in order. */
    terminal: string[];
    /**
     * Fails every HTTP request with this transport problem, whatever the path.
     * Used by the startup-failure scenarios, where the point is that no request
     * succeeds.
     */
    transportProblem?: string;
}

declare global {
    interface Window {
        /** Set by the runner through addInitScript, before anything else runs. */
        __lxcHarness?: HarnessBundle;
    }
}

/**
 * Deliver on a macrotask rather than resolving immediately.
 *
 * IncusClient registers `response()` synchronously on the object `request()`
 * returned, so a handler that fired during the call would be registered too
 * late and the ETag would never be captured.
 */
const later = (run: () => void): void => {
    setTimeout(run, 0);
};

const makeRequest = (entry: FixtureResponse | { problem: string }): CockpitHttpRequest => {
    let onResponse: ((status: number, headers: Record<string, string>) => void) | null = null;
    let onStream: ((data: string) => void | number) | null = null;
    let closed = false;

    const promise = new Promise<string>((resolve, reject) => {
        later(() => {
            if (closed) {
                const error = new Error("closed") as CockpitHttpError;
                error.problem = "cancelled";
                reject(error);
                return;
            }

            if ("problem" in entry) {
                const error = new Error(entry.problem) as CockpitHttpError;
                error.problem = entry.problem;
                reject(error);
                return;
            }

            onResponse?.(entry.status, entry.headers ?? {});

            if (entry.status >= 400) {
                /*
                 * Cockpit hands the response body back on the error for HTTP
                 * failures, and classifyTransportError in src/backend/incus/
                 * client.ts reads it as the Incus envelope. Anything less here
                 * would exercise a different branch than production does.
                 */
                const error = new Error(entry.body) as CockpitHttpError;
                error.status = entry.status;
                error.reason = entry.body;
                reject(error);
                return;
            }

            onStream?.(entry.body);
            resolve(entry.body);
        });
    });

    const request = promise as CockpitHttpRequest;
    request.response = (handler) => {
        onResponse = handler;
        return request;
    };
    request.stream = (handler) => {
        onStream = handler;
        return request;
    };
    request.close = () => {
        closed = true;
    };
    return request;
};

const makeProcess = (entry: FixtureProcess | undefined, argv: readonly string[]): CockpitSpawnProcess => {
    let onStream: ((data: string) => void) | null = null;

    const promise = new Promise<string>((resolve, reject) => {
        if (entry === undefined) {
            later(() => {
                const error = new Error(
                    `cockpit-lxc layout harness: no fixture for the process "${argv.join(" ")}". ` +
                    "Add it to test/layout/fixtures/, or the page will render a failure state " +
                    "that is a property of the harness rather than of the plugin.",
                );
                reject(error);
            });
            return;
        }

        if (entry.hang === true)
            return;

        later(() => {
            if (entry.problem !== undefined) {
                const error = new Error(entry.problem);
                reject(error);
                return;
            }
            const output = entry.output ?? "";
            onStream?.(output);
            resolve(output);
        });
    });

    const process = promise as CockpitSpawnProcess;
    process.stream = (handler) => {
        onStream = handler;
        return process;
    };
    process.input = () => process;
    process.close = () => { /* nothing to release */ };
    return process;
};

/**
 * A terminal channel that emits a fixed banner and then stays silent.
 *
 * The content is fixed so the xterm viewport holds the same glyphs on every run.
 * Its internals are outside the audit set anyway, but the container is not, and
 * a viewport whose content differs run to run is a viewport whose scrollbar can
 * differ run to run.
 */
const makeChannel = (lines: readonly string[]): CockpitChannel => {
    const listeners = new Map<string, ((event: unknown, payload: never) => void)[]>();

    const emit = (event: string, payload: unknown): void => {
        for (const handler of listeners.get(event) ?? [])
            (handler as (event: unknown, payload: unknown) => void)({}, payload);
    };

    const channel: CockpitChannel = {
        id: "harness-terminal",
        send: () => { /* input is not echoed: the output must stay fixed */ },
        control: () => { /* window size changes need no acknowledgement here */ },
        close: () => { listeners.clear(); },
        addEventListener: ((event: string, handler: (event: unknown, payload: never) => void) => {
            const existing = listeners.get(event) ?? [];
            existing.push(handler);
            listeners.set(event, existing);
        }) as CockpitChannel["addEventListener"],
        removeEventListener: (event, handler) => {
            const existing = listeners.get(event) ?? [];
            const at = existing.indexOf(handler as (event: unknown, payload: never) => void);
            if (at >= 0)
                existing.splice(at, 1);
        },
    };

    later(() => {
        emit("ready", { pid: 1 });
        emit("message", lines.join("\r\n"));
    });

    return channel;
};

const makePermission = (allowed: boolean): CockpitPermission => {
    const handlers: (() => void)[] = [];
    const permission: CockpitPermission = {
        // null until the transport answers. src/backend/permission.ts documents
        // that null must not be read as denied, so the transition is real here
        // rather than being skipped by starting at the final value.
        allowed: null,
        close: () => { handlers.length = 0; },
        addEventListener: (_event, handler) => { handlers.push(handler); },
    };

    later(() => {
        permission.allowed = allowed;
        for (const handler of handlers)
            handler();
    });

    return permission;
};

const install = (bundle: HarnessBundle): void => {
    const api: CockpitApi = {
        http: () => ({
            get: (path) => makeRequest(lookup("GET", path, bundle)),
            post: (path) => makeRequest(lookup("POST", path, bundle)),
            request: (options) => makeRequest(lookup(options.method, options.path, bundle)),
            close: () => { /* nothing to release */ },
        }),
        channel: () => makeChannel(bundle.terminal),
        spawn: (args) => makeProcess(bundle.processes[args.join(" ")], args),
        // The plugin translates through src/backend/i18n.ts against the bundled
        // English catalogue and never calls these, but CockpitApi declares them.
        gettext: ((...args: string[]) => args[args.length - 1] ?? "") as CockpitApi["gettext"],
        ngettext: (message, plural, count) => (count === 1 ? message : plural),
        format: (template, ...args) =>
            template.replace(/\$(\d+)/g, (_all, index: string) => String(args[Number(index)] ?? "")),
        permission: () => makePermission(bundle.permission.allowed),
        language: "en",
        transport: {
            origin: window.location.origin,
            uri: (suffix) => `${window.location.origin}/${suffix ?? ""}`,
            application: () => "cockpit",
        },
    };

    window.cockpit = api;
};

/**
 * Resolve one request against the fixtures.
 *
 * An unmatched request rejects rather than resolving empty. An empty body would
 * render an empty page, an empty page satisfies every geometry rule, and a green
 * run for a broken harness is the one failure mode this cannot have.
 */
const lookup = (
    method: string,
    path: string,
    bundle: HarnessBundle,
): FixtureResponse | { problem: string } => {
    if (bundle.transportProblem !== undefined)
        return { problem: bundle.transportProblem };

    const entry = bundle.responses[`${method} ${path}`];
    if (entry !== undefined)
        return entry;

    throw new Error(
        `cockpit-lxc layout harness: no fixture for "${method} ${path}". ` +
        "Record it into test/layout/fixtures/ and add it to index.json.",
    );
};

const bundle = window.__lxcHarness;
if (bundle === undefined) {
    throw new Error(
        "cockpit-lxc layout harness: window.__lxcHarness is not set. " +
        "run.mjs installs it with addInitScript before the page loads.",
    );
}

install(bundle);
