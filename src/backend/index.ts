/**
 * The backend boundary.
 *
 * This barrel is the only backend entry point the rest of the application may
 * import. The Incus implementation lands in Phase 2; until then this module
 * exports the contract and its types so that UI work can be written against it.
 */

export type {
    ContainerDriver,
    EventHandlers,
    SetStateOptions,
} from "./driver";

export { getHostName } from "./host";

export {
    ApiError,
    ConflictError,
    DriverError,
    OperationCancelled,
    OperationError,
} from "./errors";

export type { DriverErrorKind } from "./errors";

export type {
    Container,
    ContainerConfig,
    ContainerInterface,
    ContainerState,
    CreateContainerSpec,
    Image,
    LifecycleEvent,
    Metrics,
    Network,
    NetworkAddress,
    Profile,
    ServerInfo,
    Snapshot,
    StoragePool,
    TerminalHandle,
    TerminalMode,
} from "./types";

/**
 * Path to the Incus REST socket.
 *
 * This is /run/incus, not /var/lib/incus. The systemd unit declares
 * `ListenStream=/run/incus/unix.socket`, and /var/lib/incus holds the daemon's
 * state rather than its socket. Verified against Incus 6.23 on Rocky Linux 10.2;
 * the socket is owned root:incus-admin with mode 0660, which is why the driver
 * opens it with superuser: "require".
 */
export const INCUS_SOCKET = "/run/incus/unix.socket";
