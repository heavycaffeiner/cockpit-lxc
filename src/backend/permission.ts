import cockpit from "cockpit";

/**
 * Watch whether this session holds administrative access.
 *
 * base1 exposes `cockpit.permission`. It does not expose `cockpit.superuser`:
 * that is a helper in Cockpit's own pkg/lib, absent from the global this plugin
 * loads, and calling it throws on mount. Verified against Cockpit 356.2.
 *
 * `allowed` is null until the transport has answered. Callers must treat null as
 * "not known yet" rather than as "denied", or the page will flash the
 * administrative-access screen on every load.
 */
export interface AdminWatch {
    allowed(): boolean | null;
    close(): void;
}

export const watchAdmin = (onChange: () => void): AdminWatch => {
    const permission = cockpit.permission({ admin: true });
    permission.addEventListener("changed", onChange);

    return {
        allowed: () => permission.allowed,
        // close() is the documented teardown and detaches the listener with it.
        close: () => permission.close(),
    };
};
