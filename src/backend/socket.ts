/**
 * Path to the Incus REST socket.
 *
 * This is /run/incus, not /var/lib/incus. The systemd unit declares
 * `ListenStream=/run/incus/unix.socket`, and /var/lib/incus holds the daemon's
 * state rather than its socket. Verified against Incus 6.23 on Rocky Linux 10.2;
 * the socket is owned root:incus-admin with mode 0660, which is why the client
 * opens it with superuser: "require".
 *
 * It lives in its own module so that the client can import it without pulling in
 * the package barrel, which would be a cycle.
 */
export const INCUS_SOCKET = "/run/incus/unix.socket";
