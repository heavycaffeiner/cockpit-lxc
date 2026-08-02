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

/** Path to the Incus REST socket. */
export const INCUS_SOCKET = "/var/lib/incus/unix.socket";
