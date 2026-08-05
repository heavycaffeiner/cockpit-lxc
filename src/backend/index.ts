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

export { K, _, N_, format, type MessageKey } from "./i18n";

export { watchAdmin } from "./permission";
export type { AdminWatch } from "./permission";

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
    ContainerUpdate,
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
