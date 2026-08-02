/**
 * Typings for the subset of Cockpit's client library this plugin uses.
 *
 * Cockpit provides the implementation at runtime from ../base1/cockpit.js, via
 * the import map in index.html. These declarations are hand-maintained and cover
 * only what src/backend/ actually calls; grow them as the driver grows rather
 * than transcribing the whole API up front.
 */
declare module "cockpit" {
    type Superuser = "require" | "try";

    interface HttpOptions {
        /** Path to a unix socket, for example /var/lib/incus/unix.socket. */
        unix?: string;
        address?: string;
        port?: number;
        headers?: Record<string, string>;
        superuser?: Superuser;
    }

    interface HttpRequestOptions {
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
    interface HttpError extends Error {
        problem?: string;
        status?: number;
        reason?: string;
    }

    interface HttpRequest extends Promise<string> {
        /** Observe the status line and headers before the body is complete. */
        response(handler: (status: number, headers: Record<string, string>) => void): HttpRequest;
        /** Consume the body incrementally. Return the number of bytes taken. */
        stream(handler: (data: string) => void | number): HttpRequest;
        close(problem?: string): void;
    }

    interface HttpClient {
        get(path: string, params?: Record<string, string>, headers?: Record<string, string>): HttpRequest;
        post(path: string, body?: string, headers?: Record<string, string>): HttpRequest;
        request(options: HttpRequestOptions): HttpRequest;
        close(problem?: string): void;
    }

    interface ChannelOptions {
        payload: string;
        spawn?: string[];
        environ?: string[];
        directory?: string;
        pty?: boolean;
        binary?: boolean;
        err?: "out" | "ignore" | "message";
        superuser?: Superuser;
    }

    interface ControlMessage {
        command: string;
        [key: string]: unknown;
    }

    interface Channel<T = string | Uint8Array> {
        id: string | null;
        send(data: T): void;
        control(options: ControlMessage): void;
        close(problem?: string): void;
        addEventListener(event: "message", handler: (ev: unknown, data: T) => void): void;
        addEventListener(event: "ready", handler: (ev: unknown, message: { pid?: number }) => void): void;
        addEventListener(event: "close", handler: (ev: unknown, options: { problem?: string; "exit-status"?: number }) => void): void;
        removeEventListener(event: string, handler: (...args: never[]) => void): void;
    }

    interface SpawnOptions {
        superuser?: Superuser;
        directory?: string;
        environ?: string[];
        err?: "out" | "ignore" | "message";
        binary?: boolean;
        pty?: boolean;
    }

    interface SpawnProcess extends Promise<string> {
        stream(handler: (data: string) => void): SpawnProcess;
        input(data: string, stream?: boolean): SpawnProcess;
        close(problem?: string): void;
    }

    interface SuperuserProxy {
        allowed: boolean | null;
        addEventListener(event: "changed", handler: () => void): void;
        removeEventListener(event: "changed", handler: () => void): void;
        reload_page_on_change(): void;
    }

    function http(options: HttpOptions): HttpClient;
    function http(endpoint: string | number, options?: HttpOptions): HttpClient;
    function channel(options: ChannelOptions): Channel;
    function spawn(args: string[], options?: SpawnOptions): SpawnProcess;
    function gettext(message: string): string;
    function gettext(context: string, message: string): string;
    function ngettext(message: string, plural: string, count: number): string;
    function format(template: string, ...args: unknown[]): string;

    const superuser: SuperuserProxy;
    const transport: { host: string };

    export {
        http, channel, spawn, gettext, ngettext, format, superuser, transport,
        type HttpClient, type HttpError, type HttpRequest, type Channel,
        type ChannelOptions, type SpawnProcess, type SuperuserProxy,
    };

    const cockpit: {
        http: typeof http;
        channel: typeof channel;
        spawn: typeof spawn;
        gettext: typeof gettext;
        ngettext: typeof ngettext;
        format: typeof format;
        superuser: SuperuserProxy;
        transport: { host: string };
    };
    export default cockpit;
}
