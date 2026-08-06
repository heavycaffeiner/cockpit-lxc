/**
 * Where the Incus REST socket lives, which is not the same on every distribution.
 *
 * Fedora and RHEL package Incus with `ListenStream=/run/incus/unix.socket`, and
 * on those hosts /var/lib/incus holds the daemon's state rather than its socket.
 * Arch packages it the other way round: there is no /run/incus at all, and the
 * socket is /var/lib/incus/unix.socket. Verified on Incus 6.23 on Rocky Linux
 * 10.2 and Incus 7.3.0 on Arch.
 *
 * Both are tried in turn rather than one being chosen by guessing at the
 * distribution: a host is the authority on where its own socket is, and reading
 * /etc/os-release to decide would be a second thing to keep correct as
 * packaging changes.
 *
 * Ordered with /run first because that is where a socket belongs and where the
 * majority of packaging puts it; the fallback costs one failed connect on the
 * hosts that need it, once per session.
 *
 * This lives in its own module so the client can import it without pulling in
 * the package barrel, which would be a cycle.
 */
export const INCUS_SOCKETS: readonly string[] = [
    "/run/incus/unix.socket",
    "/var/lib/incus/unix.socket",
];

/**
 * The first candidate, used where one path has to be named: the message shown
 * when no socket is found at all, and the default before probing has settled.
 */
export const INCUS_SOCKET = INCUS_SOCKETS[0] as string;
