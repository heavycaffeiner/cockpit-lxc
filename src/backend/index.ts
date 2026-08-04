/**
 * The backend boundary.
 *
 * This barrel is the only backend entry point the rest of the application may
 * import. Nothing above it imports cockpit, and eslint.config.js enforces that
 * for both the module specifier and the window global.
 */

export type {
    ContainerDriver,
    EventHandlers,
    SetStateOptions,
} from "./driver";

export { getHostName } from "./host";
export { hasSuperuser, reloadOnSuperuserChange } from "./superuser";

export {
    ApiError,
    ConflictError,
    DriverError,
    OperationCancelled,
    OperationError,
} from "./errors";

export type { DriverErrorKind } from "./errors";

export { INCUS_SOCKET } from "./socket";

export { IncusDriver } from "./incus/driver";
export { IncusClient } from "./incus/client";

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
