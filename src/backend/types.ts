/**
 * Domain types for the backend boundary.
 *
 * These are deliberately not a transcription of Incus's wire format. They are
 * the vocabulary the UI programs against, so that a driver for another container
 * manager could satisfy the same interface. Fields are added as the phases that
 * need them land, not up front.
 */

export type ContainerState = "Running" | "Stopped" | "Frozen" | "Starting" | "Stopping" | "Error";

/** The instance `config` map. Incus keys are free-form strings by design. */
export type ContainerConfig = Record<string, string>;

export interface ServerInfo {
    /** Incus API version, from GET /1.0 metadata.api_version. */
    apiVersion: string;
    /** Server version, used for the minimum-version check at startup. */
    serverVersion: string;
    /**
     * Available API extensions. Feature-gated UI checks this set and hides a
     * control rather than rendering one that would fail at submit time.
     */
    extensions: ReadonlySet<string>;
    /** True when metadata.auth === "trusted". */
    trusted: boolean;
}

export interface NetworkAddress {
    family: "inet" | "inet6";
    address: string;
    netmask: string;
    scope: string;
}

export interface ContainerInterface {
    name: string;
    hwaddr: string;
    mtu: number;
    addresses: readonly NetworkAddress[];
}

export interface Container {
    name: string;
    state: ContainerState;
    /** Image description the instance was created from, when known. */
    description: string;
    architecture: string;
    ephemeral: boolean;
    createdAt: string;
    profiles: readonly string[];
    config: ContainerConfig;
    devices: Record<string, Record<string, string>>;
    interfaces: readonly ContainerInterface[];
}

export interface Snapshot {
    name: string;
    createdAt: string;
    /** Whether the running process state was captured alongside the disk. */
    stateful: boolean;
    expiresAt: string | null;
}

export interface Profile {
    name: string;
    description: string;
    config: ContainerConfig;
    devices: Record<string, Record<string, string>>;
    usedBy: readonly string[];
}

export interface Network {
    name: string;
    type: string;
    managed: boolean;
    description: string;
    config: Record<string, string>;
    usedBy: readonly string[];
}

export interface StoragePool {
    name: string;
    driver: string;
    description: string;
    config: Record<string, string>;
    usedBy: readonly string[];
}

export interface Image {
    fingerprint: string;
    aliases: readonly string[];
    description: string;
    architecture: string;
    size: number;
    uploadedAt: string;
}

export interface Metrics {
    cpuSecondsTotal: number;
    memoryUsedBytes: number;
    memoryTotalBytes: number;
    diskUsedBytes: number;
    networkReceiveBytes: number;
    networkTransmitBytes: number;
}

export interface LifecycleEvent {
    /** Dotted action, for example "instance-started" or "instance-updated". */
    action: string;
    /** Instance name parsed out of metadata.source. */
    instance: string;
    timestamp: string;
}

export interface CreateContainerSpec {
    name: string;
    /** Image alias or fingerprint, resolved against `remote`. */
    image: string;
    /** Configured remote to pull from, for example "images". */
    remote: string;
    profiles: readonly string[];
    config: ContainerConfig;
    ephemeral: boolean;
    /** Start the container once creation completes. */
    start: boolean;
}

/**
 * An open pty into a container.
 *
 * The caller owns the lifetime. close() must be called on unmount or the host is
 * left with an orphaned process; Cockpit gives no guarantee the iframe survives
 * navigation, so nothing else will clean it up.
 */
export interface TerminalHandle {
    send(data: string | Uint8Array): void;
    resize(rows: number, cols: number): void;
    onData(handler: (chunk: Uint8Array) => void): void;
    onReady(handler: (pid: number | undefined) => void): void;
    onClose(handler: (reason: string) => void): void;
    close(): void;
}

export type TerminalMode = "exec" | "console";
