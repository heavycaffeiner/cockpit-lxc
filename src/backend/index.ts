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

export { T, format } from "./i18n";

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

export { INCUS_SOCKET, INCUS_SOCKETS } from "./socket";

export { IncusDriver } from "./incus/driver";
export { IncusClient } from "./incus/client";

export type {
    ConfigSchema,
    Container,
    ContainerConfig,
    ContainerInterface,
    ContainerState,
    ContainerUpdate,
    CreateContainerSpec,
    Image,
    LifecycleEvent,
    LogFile,
    Metrics,
    Network,
    NetworkAddress,
    OptionSpec,
    OptionType,
    Profile,
    Remote,
    RemoteImage,
    ResourceUpdate,
    ServerInfo,
    Snapshot,
    StoragePool,
    StorageVolume,
    TerminalHandle,
    TerminalMode,
} from "./types";
