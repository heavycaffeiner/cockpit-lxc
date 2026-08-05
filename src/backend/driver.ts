import type {
    Container,
    ContainerConfig,
    ContainerUpdate,
    CreateContainerSpec,
    Image,
    LifecycleEvent,
    LogFile,
    Metrics,
    Network,
    Profile,
    Remote,
    RemoteImage,
    ResourceUpdate,
    ServerInfo,
    Snapshot,
    StoragePool,
    TerminalHandle,
    TerminalMode,
} from "./types";

export interface SetStateOptions {
    /**
     * Maps to Incus's force flag. For stop this means SIGKILL rather than a
     * clean shutdown, so callers must have confirmed with the operator first.
     */
    force?: boolean;
    /** Graceful shutdown window, in seconds. */
    timeout?: number;
}

export interface EventHandlers {
    onLifecycle(event: LifecycleEvent): void;
    /**
     * Reports whether live updates are currently working. The subscription does
     * not fail when the stream drops, because unmounting the view over a
     * transient stream loss is worse than showing a degraded indicator.
     */
    onDegraded(degraded: boolean): void;
}

/**
 * The single seam between the UI and the container manager.
 *
 * Everything above this interface is backend-agnostic; everything below it is
 * Incus-specific. Nothing outside src/backend/ may import cockpit directly, and
 * eslint.config.js enforces that.
 */
export interface ContainerDriver {
    /**
     * Probe the backend and report its capabilities. Called once at startup,
     * before any other method. Rejects with a DriverError whose `kind` field
     * distinguishes "not-installed", "access-denied" and "untrusted", because
     * each maps to a different empty state.
     */
    probe(): Promise<ServerInfo>;

    /**
     * List system containers. Virtual machines are filtered out. Uses
     * recursion=2 so that state arrives in the same round trip, which is a
     * deliberate bandwidth-for-latency trade since the list view needs state.
     */
    listContainers(): Promise<Container[]>;

    /**
     * Fetch one container together with the ETag needed to write it back safely.
     * The ETag is opaque to callers and must be passed through to updateConfig.
     */
    getContainer(name: string): Promise<{ container: Container; etag: string }>;

    /**
     * Replace the editable half of an instance.
     *
     * `etag` must come from the getContainer call this edit was based on.
     * Rejects with ConflictError carrying the current server-side object when
     * the precondition fails, so the caller can present a conflict rather than
     * losing the operator's input.
     *
     * Takes the whole ContainerUpdate rather than just a config map, because
     * Incus's PUT is a replace: a body carrying only `config` leaves the
     * instance with no devices and fails with "no root device could be found".
     * Keys absent from `update.config` are removed, which is the only way to
     * unset one; PATCH cannot express removal.
     */
    updateConfig(name: string, update: ContainerUpdate, etag: string): Promise<void>;

    /**
     * Merge a partial configuration. Cannot remove keys. No ETag round trip is
     * needed, because a merge of disjoint keys cannot clobber a concurrent edit.
     */
    patchConfig(name: string, partial: Readonly<ContainerConfig>): Promise<void>;

    setState(
        name: string,
        action: "start" | "stop" | "restart" | "freeze" | "unfreeze",
        options?: SetStateOptions,
    ): Promise<void>;

    /** Create from an image. Resolves only after the async operation settles. */
    createContainer(spec: CreateContainerSpec): Promise<void>;

    /** Delete a container and its snapshots. Refuses while it is running. */
    deleteContainer(name: string): Promise<void>;

    renameContainer(name: string, newName: string): Promise<void>;

    /**
     * Clone a container, configuration and disk together. Distinct from
     * creating a fresh instance from the same image.
     */
    copyContainer(name: string, newName: string): Promise<void>;

    listSnapshots(name: string): Promise<Snapshot[]>;
    createSnapshot(name: string, snapshot: string, stateful: boolean): Promise<void>;
    restoreSnapshot(name: string, snapshot: string): Promise<void>;
    renameSnapshot(name: string, snapshot: string, newName: string): Promise<void>;
    deleteSnapshot(name: string, snapshot: string): Promise<void>;

    /** Log files Incus keeps for an instance, such as lxc.log and console.log. */
    listLogs(name: string): Promise<LogFile[]>;

    /**
     * Read one log file. Returns the tail rather than the whole file, because a
     * console log grows without bound and the end is the part being asked about.
     */
    readLog(name: string, file: string, tailLines: number): Promise<string>;

    listProfiles(): Promise<Profile[]>;
    createProfile(name: string, update: ResourceUpdate): Promise<void>;
    updateProfile(name: string, update: ResourceUpdate): Promise<void>;
    deleteProfile(name: string): Promise<void>;

    listNetworks(): Promise<Network[]>;
    createNetwork(name: string, type: string, update: ResourceUpdate): Promise<void>;
    updateNetwork(name: string, update: ResourceUpdate): Promise<void>;
    deleteNetwork(name: string): Promise<void>;

    listStoragePools(): Promise<StoragePool[]>;
    createStoragePool(name: string, driver: string, update: ResourceUpdate): Promise<void>;
    updateStoragePool(name: string, update: ResourceUpdate): Promise<void>;
    deleteStoragePool(name: string): Promise<void>;

    listImages(): Promise<Image[]>;

    /** Image servers the CLI has configured, so the operator can browse them. */
    listRemotes(): Promise<Remote[]>;

    /** What a remote offers, so an image can be chosen rather than typed. */
    listRemoteImages(remote: string): Promise<RemoteImage[]>;

    /** Pull an image from a configured remote onto this host. */
    pullImage(
        alias: string,
        remote: string,
        onProgress?: (text: string) => void,
    ): Promise<void>;

    deleteImage(fingerprint: string): Promise<void>;

    /**
     * Name a local image. A cached image arrives with no alias, leaving a
     * 64-character fingerprint as its only handle.
     */
    createImageAlias(fingerprint: string, alias: string, description: string): Promise<void>;

    deleteImageAlias(alias: string): Promise<void>;

    /**
     * Per-container metrics, parsed from the OpenMetrics text body and keyed by
     * container name. Polled; Incus offers no push equivalent.
     */
    getMetrics(): Promise<Map<string, Metrics>>;

    /** Subscribe to lifecycle events. Returns an unsubscribe function. */
    subscribeEvents(handlers: EventHandlers): () => void;

    /**
     * Open an interactive pty into a running container. The caller owns the
     * returned handle and must close() it on unmount.
     */
    openTerminal(name: string, mode: TerminalMode): TerminalHandle;
}
