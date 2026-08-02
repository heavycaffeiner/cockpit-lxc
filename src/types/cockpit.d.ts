/**
 * Ambient typings for the subset of Cockpit's client library this plugin uses.
 *
 * Cockpit ships base1/cockpit.js as an IIFE that assigns `window.cockpit`. It
 * exports nothing, so it cannot be imported as an ES module: index.html loads it
 * with a classic <script> tag and src/backend/cockpit-runtime.ts re-exports the
 * global. That shim is what the bare "cockpit" specifier resolves to, via
 * tsconfig `paths` and the matching esbuild `alias`.
 *
 * These declarations are hand-maintained and cover only what src/backend/
 * actually calls. Grow them as the driver grows rather than transcribing the
 * whole API up front.
 */

type CockpitSuperuser = "require" | "try";

interface CockpitHttpOptions {
    /** Path to a unix socket, for example /run/incus/unix.socket. */
    unix?: string;
    address?: string;
    port?: number;
    headers?: Record<string, string>;
    superuser?: CockpitSuperuser;
}

interface CockpitHttpRequestOptions {
    method: string;
    path: string;
    body?: string;
    headers?: Record<string, string>;
}

/**
 * Rejection value for a failed request. `problem` carries Cockpit's own
 * transport-level classification ("not-found", "access-denied", ...) and is
 * absent when the failure came back as an HTTP status instead.
 */
interface CockpitHttpError extends Error {
    problem?: string;
    status?: number;
    reason?: string;
}

interface CockpitHttpRequest extends Promise<string> {
    /** Observe the status line and headers before the body is complete. */
    response(handler: (status: number, headers: Record<string, string>) => void): CockpitHttpRequest;
    /** Consume the body incrementally. Return the number of bytes taken. */
    stream(handler: (data: string) => void | number): CockpitHttpRequest;
    close(problem?: string): void;
}

interface CockpitHttpClient {
    get(path: string, params?: Record<string, string>, headers?: Record<string, string>): CockpitHttpRequest;
    post(path: string, body?: string, headers?: Record<string, string>): CockpitHttpRequest;
    request(options: CockpitHttpRequestOptions): CockpitHttpRequest;
    close(problem?: string): void;
}

interface CockpitChannelOptions {
    payload: string;
    spawn?: string[];
    environ?: string[];
    directory?: string;
    pty?: boolean;
    binary?: boolean;
    err?: "out" | "ignore" | "message";
    superuser?: CockpitSuperuser;
}

interface CockpitControlMessage {
    command: string;
    [key: string]: unknown;
}

interface CockpitChannel<T = string | Uint8Array> {
    id: string | null;
    send(data: T): void;
    control(options: CockpitControlMessage): void;
    close(problem?: string): void;
    addEventListener(event: "message", handler: (ev: unknown, data: T) => void): void;
    addEventListener(event: "ready", handler: (ev: unknown, message: { pid?: number }) => void): void;
    addEventListener(
        event: "close",
        handler: (ev: unknown, options: { problem?: string; "exit-status"?: number }) => void,
    ): void;
    removeEventListener(event: string, handler: (...args: never[]) => void): void;
}

interface CockpitSpawnOptions {
    superuser?: CockpitSuperuser;
    directory?: string;
    environ?: string[];
    err?: "out" | "ignore" | "message";
    binary?: boolean;
    pty?: boolean;
}

interface CockpitSpawnProcess extends Promise<string> {
    stream(handler: (data: string) => void): CockpitSpawnProcess;
    input(data: string, stream?: boolean): CockpitSpawnProcess;
    close(problem?: string): void;
}

interface CockpitSuperuserProxy {
    allowed: boolean | null;
    addEventListener(event: "changed", handler: () => void): void;
    removeEventListener(event: "changed", handler: () => void): void;
    reload_page_on_change(): void;
}

interface CockpitApi {
    http(options: CockpitHttpOptions): CockpitHttpClient;
    http(endpoint: string | number, options?: CockpitHttpOptions): CockpitHttpClient;
    channel(options: CockpitChannelOptions): CockpitChannel;
    spawn(args: string[], options?: CockpitSpawnOptions): CockpitSpawnProcess;
    gettext(message: string): string;
    gettext(context: string, message: string): string;
    ngettext(message: string, plural: string, count: number): string;
    format(template: string, ...args: unknown[]): string;
    superuser: CockpitSuperuserProxy;
    transport: { host: string };
}

interface Window {
    /** Set by base1/cockpit.js, which index.html loads as a classic script. */
    cockpit?: CockpitApi;
}
