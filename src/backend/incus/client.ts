import cockpit from "cockpit";

import {
    ApiError,
    DriverError,
    OperationCancelled,
    OperationError,
} from "../errors";
import { INCUS_SOCKET } from "../socket";
import { envelopeToApiError, parseEnvelope, type Envelope } from "./envelope";
import { OperationStatus, type WireOperation } from "./wire";

/** How long a single wait on an async operation blocks before being re-issued. */
const OPERATION_WAIT_SECONDS = 30;

/**
 * Upper bound on re-issued waits, so a permanently stuck operation eventually
 * surfaces instead of looping forever. Thirty seconds times forty is twenty
 * minutes, which comfortably covers a large image pull on a slow link.
 */
const OPERATION_WAIT_ATTEMPTS = 40;

export interface RequestOptions {
    method?: string;
    body?: unknown;
    headers?: Record<string, string>;
    /** Receives the response headers, which is how the ETag is captured. */
    onHeaders?: (headers: Record<string, string>) => void;
    /** Reports async operation progress as Incus publishes it. */
    onProgress?: (metadata: Record<string, unknown> | null) => void;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null;

/**
 * Header names are matched case-insensitively.
 *
 * Incus sends `Etag`, not `ETag` or `etag`, and nothing guarantees Cockpit
 * preserves that casing on the way through. Looking it up by exact key is the
 * kind of thing that works until it silently does not.
 */
export const headerValue = (
    headers: Record<string, string>,
    name: string,
): string | undefined => {
    const wanted = name.toLowerCase();
    for (const [key, value] of Object.entries(headers)) {
        if (key.toLowerCase() === wanted)
            return value;
    }
    return undefined;
};

/**
 * Translate a Cockpit transport failure into the driver's taxonomy.
 *
 * Cockpit reports transport-level trouble through `problem` and HTTP status
 * through `status`. The two are distinct failures with distinct remedies: a
 * missing socket means Incus is not installed, whereas a 403 means Incus itself
 * refused, and collapsing them wastes the operator's time.
 */
const classifyTransportError = (reason: unknown): Error => {
    if (!isRecord(reason))
        return new DriverError("transport", "The connection to Incus failed");

    const status = reason["status"];
    if (typeof status === "number" && status >= 400) {
        /*
         * Cockpit hands back the response body on the error for HTTP failures.
         * Incus puts a useful sentence in the envelope's `error`, so prefer that
         * over Cockpit's generic reason string when it parses.
         */
        const message = reason["message"];
        if (typeof message === "string" && message !== "") {
            try {
                return envelopeToApiError(parseEnvelope(message));
            } catch {
                return new ApiError(status, message);
            }
        }
        const reasonText = reason["reason"];
        return new ApiError(
            status,
            typeof reasonText === "string" ? reasonText : `Incus returned HTTP ${status}`,
        );
    }

    const problem = reason["problem"];
    if (typeof problem !== "string")
        return new DriverError("transport", "The connection to Incus failed");

    switch (problem) {
        case "not-found":
            return new DriverError(
                "not-installed",
                `No Incus socket at ${INCUS_SOCKET}`,
                problem,
            );
        case "access-denied":
        case "authentication-failed":
            return new DriverError(
                "access-denied",
                "Administrative access is required to reach Incus",
                problem,
            );
        default:
            return new DriverError("transport", `The connection to Incus failed: ${problem}`, problem);
    }
};

/**
 * The Incus REST client.
 *
 * Every mutating call funnels through `request`, whose correctness determines
 * whether the UI can ever report success prematurely.
 */
export class IncusClient {
    private readonly http: CockpitHttpClient;

    constructor(socket: string = INCUS_SOCKET) {
        this.http = cockpit.http({ unix: socket, superuser: "require" });
    }

    /** Release every in-flight request. Called when the driver is torn down. */
    close(): void {
        this.http.close("terminated");
    }

    /**
     * Issue one HTTP request and return its body verbatim.
     *
     * Most endpoints answer with an envelope, but not all: a log file comes back
     * as the file, so the body cannot be parsed unconditionally.
     */
    async text(path: string, options: RequestOptions = {}): Promise<string> {
        const { method = "GET", body, headers = {}, onHeaders } = options;

        const requestHeaders: Record<string, string> = { ...headers };

        /*
         * The empty string matters. Cockpit treats a missing `body` as a promise
         * to stream one later, so the channel never signals end-of-input and the
         * request hangs with no error and no timeout.
         */
        let encodedBody = "";
        if (body !== undefined) {
            encodedBody = JSON.stringify(body);
            requestHeaders["Content-Type"] = "application/json";
        }

        const request = this.http.request({
            method,
            path,
            body: encodedBody,
            headers: requestHeaders,
        });

        if (onHeaders !== undefined)
            request.response((_status, responseHeaders) => onHeaders(responseHeaders));

        try {
            return await request;
        } catch (reason) {
            throw classifyTransportError(reason);
        }
    }

    /** Issue one HTTP request and return its parsed envelope. */
    private async raw(path: string, options: RequestOptions = {}): Promise<Envelope> {
        return parseEnvelope(await this.text(path, options));
    }

    /**
     * Issue a request and resolve only once the work has actually finished.
     *
     * A `sync` envelope carries the result directly. An `async` envelope carries
     * an operation that is still running, and this waits on it: returning its
     * metadata as though it were the result is the mistake that makes a UI claim
     * a container started before it did.
     */
    async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
        const envelope = await this.raw(path, options);

        switch (envelope.type) {
            case "error":
                throw envelopeToApiError(envelope);

            case "sync":
                return envelope.metadata as T;

            case "async": {
                const operation = envelope.metadata as WireOperation | undefined;
                const id = operation?.id;
                if (typeof id !== "string" || id === "") {
                    throw new DriverError(
                        "parse",
                        "Incus returned an async response without an operation id",
                    );
                }
                return await this.waitForOperation<T>(id, options.onProgress);
            }
        }
    }

    /**
     * Block on an async operation until it settles.
     *
     * The wait is bounded and re-issued rather than passing `timeout=-1`. An
     * unbounded wait would leave a hung operation as a promise that never
     * settles, which the UI cannot render as anything a user can act on; a
     * bounded loop keeps it visible and cancellable.
     */
    private async waitForOperation<T>(
        id: string,
        onProgress?: (metadata: Record<string, unknown> | null) => void,
    ): Promise<T> {
        for (let attempt = 0; attempt < OPERATION_WAIT_ATTEMPTS; attempt += 1) {
            const envelope = await this.raw(
                `/1.0/operations/${encodeURIComponent(id)}/wait?timeout=${OPERATION_WAIT_SECONDS}`,
            );

            if (envelope.type === "error")
                throw envelopeToApiError(envelope);

            const operation = envelope.metadata as WireOperation | undefined;
            const code = operation?.status_code;

            switch (code) {
                case OperationStatus.Success:
                    return operation?.metadata as T;

                case OperationStatus.Failure:
                    throw new OperationError(
                        operation?.err !== undefined && operation.err !== ""
                            ? operation.err
                            : "The operation failed without a reason",
                    );

                case OperationStatus.Cancelled:
                    throw new OperationCancelled();

                default:
                    // Still running. Report progress and wait again.
                    onProgress?.(operation?.metadata ?? null);
            }
        }

        throw new OperationError(
            `The operation did not finish within ` +
            `${(OPERATION_WAIT_SECONDS * OPERATION_WAIT_ATTEMPTS) / 60} minutes`,
        );
    }

    /**
     * A GET that also returns the ETag, which is required to write the object
     * back safely. The ETag is opaque to callers and must be passed through
     * unchanged to the matching PUT.
     */
    async getWithEtag<T>(path: string): Promise<{ data: T; etag: string | undefined }> {
        let etag: string | undefined;
        const data = await this.request<T>(path, {
            onHeaders: (headers) => {
                etag = headerValue(headers, "etag");
            },
        });
        return { data, etag };
    }
}
