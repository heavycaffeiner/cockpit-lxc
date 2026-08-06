/**
 * Domain types for the backend boundary.
 *
 * These are deliberately not a transcription of Incus's wire format. They are
 * the vocabulary the UI programs against, so that a driver for another container
 * manager could satisfy the same interface. Fields are added as the phases that
 * need them land, not up front.
 */

/**
 * Instance run state.
 *
 * Derived from Incus's numeric `status_code`, not its `status` string: the code
 * is part of the API while the string is a display label Incus may reword.
 * "Unknown" covers codes the plugin does not recognise, so that a new Incus
 * state degrades to an honest label rather than being reported as an error.
 */
export type ContainerState =
    | "Running"
    | "Stopped"
    | "Frozen"
    | "Starting"
    | "Stopping"
    | "Freezing"
    | "Error"
    | "Unknown";

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
    description: string;
    architecture: string;
    ephemeral: boolean;
    createdAt: string;
    profiles: readonly string[];
    /**
     * Effective configuration: instance keys merged with the applied profiles.
     * This is what to display, because it is what the container actually runs
     * with.
     */
    config: ContainerConfig;
    /**
     * Keys set on the instance itself, which is what a write must send back.
     *
     * Writing the expanded map instead would copy every profile value onto the
     * instance, silently severing the container from the profile that was
     * supplying them.
     */
    localConfig: ContainerConfig;
    /** Effective devices, for display. */
    devices: Record<string, Record<string, string>>;
    /** Instance-local devices, for writing. */
    localDevices: Record<string, Record<string, string>>;
    interfaces: readonly ContainerInterface[];
    /**
     * Resource usage, null while the container is not running.
     *
     * Carried on the container rather than fetched separately because the
     * recursion=2 listing already contains it. Asking for it again would mean a
     * second full instance fetch on every refresh, and the event stream makes
     * those frequent.
     */
    metrics: Metrics | null;
}

/**
 * The editable half of an instance, as PUT requires it.
 *
 * Incus's PUT is a true replace, not a merge: sending only `config` leaves the
 * instance with no devices and the write fails with "no root device could be
 * found". Every field here has to go back even when the form only touched one
 * of them.
 *
 * `config` keeps its volatile.* entries. They are not editable, and Incus
 * rejects a body that drops them with "volatile idmap keys can't be deleted by
 * the user".
 */
export interface ContainerUpdate {
    architecture: string;
    description: string;
    ephemeral: boolean;
    profiles: readonly string[];
    config: ContainerConfig;
    devices: Record<string, Record<string, string>>;
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

/**
 * A configured image server.
 *
 * Remotes are a client-side concept: the daemon has no endpoint for them,
 * because it is the CLI that keeps the list. They are read by running the CLI
 * rather than guessed at, so a host with extra remotes configured shows them.
 */
export interface Remote {
    name: string;
    address: string;
    protocol: string;
    /** True for the local unix socket, which is not an image source. */
    isLocal: boolean;
}

/** One image offered by a remote, as its catalogue lists it. */
export interface RemoteImage {
    /** The alias to create from, without the remote prefix. */
    alias: string;
    description: string;
    architecture: string;
    size: number;
    type: string;
}

/** A log file Incus keeps for an instance. */
export interface LogFile {
    name: string;
    /** Bytes, or null when Incus does not report a size for it. */
    size: number | null;
}

/** The editable half of a profile, network or storage pool. */
export interface ResourceUpdate {
    description: string;
    config: Record<string, string>;
    devices?: Record<string, Record<string, string>>;
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
    /**
     * An image already on this host, named by its alias or, when it has none,
     * by its fingerprint.
     *
     * Creating never pulls. A create that silently downloads several hundred
     * megabytes takes minutes and reports nothing useful while it does, and the
     * two failures it can produce, "no such image" and "the download failed",
     * are indistinguishable from the container's point of view. Pulling is its
     * own step on the Images page.
     */
    image: string;
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
