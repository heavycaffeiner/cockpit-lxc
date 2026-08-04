import type { ContainerDriver, EventHandlers, SetStateOptions } from "../driver";
import { ConflictError, DriverError } from "../errors";
import type {
    Container,
    ContainerConfig,
    CreateContainerSpec,
    Image,
    Metrics,
    Network,
    Profile,
    ServerInfo,
    Snapshot,
    StoragePool,
    TerminalHandle,
    TerminalMode,
} from "../types";
import { IncusClient } from "./client";
import {
    isContainer,
    mapContainer,
    mapMetrics,
    mapNetwork,
    mapProfile,
    mapServerInfo,
    mapStoragePool,
} from "./map";
import type {
    WireInstance,
    WireNetwork,
    WireProfile,
    WireServerInfo,
    WireStoragePool,
} from "./wire";

const notImplemented = (phase: string, method: string): never => {
    throw new DriverError(
        "transport",
        `${method} is not implemented yet; it lands in ${phase}`,
    );
};

/**
 * The Incus implementation of ContainerDriver.
 *
 * Phase 2 covers the read path. The mutating methods are declared so that the
 * interface is satisfied and the UI can be written against the whole surface,
 * and each throws with the phase that will fill it in rather than silently
 * resolving, which would look like success.
 */
export class IncusDriver implements ContainerDriver {
    private readonly client: IncusClient;

    constructor(client: IncusClient = new IncusClient()) {
        this.client = client;
    }

    close(): void {
        this.client.close();
    }

    async probe(): Promise<ServerInfo> {
        const wire = await this.client.request<WireServerInfo>("/1.0");
        const info = mapServerInfo(wire);

        /*
         * A reachable but untrusted socket is its own failure. It is not an
         * access problem Cockpit can escalate away, so it must not be reported
         * as one: the operator has to fix Incus's trust configuration.
         */
        if (!info.trusted) {
            throw new DriverError(
                "untrusted",
                "Incus answered but does not trust this connection",
            );
        }

        return info;
    }

    /**
     * recursion=2 fetches configuration and live state in one round trip. That
     * is a deliberate bandwidth-for-latency trade: the list view needs state for
     * every row, and fetching it per row would turn one request into N.
     */
    async listContainers(): Promise<Container[]> {
        const wire = await this.client.request<WireInstance[]>("/1.0/instances?recursion=2");
        if (!Array.isArray(wire))
            throw new DriverError("parse", "Incus returned a non-list of instances");

        return wire
            .filter(isContainer)
            .map(mapContainer)
            .filter((container): container is Container => container !== null);
    }

    async getContainer(name: string): Promise<{ container: Container; etag: string }> {
        const path = `/1.0/instances/${encodeURIComponent(name)}`;
        const { data, etag } = await this.client.getWithEtag<WireInstance>(path);

        const container = mapContainer(data);
        if (container === null)
            throw new DriverError("parse", `Incus returned no usable record for ${name}`);

        if (etag === undefined) {
            throw new DriverError(
                "parse",
                `Incus returned no ETag for ${name}, so this object cannot be written back safely`,
            );
        }

        return { container, etag };
    }

    async listProfiles(): Promise<Profile[]> {
        const wire = await this.client.request<WireProfile[]>("/1.0/profiles?recursion=1");
        if (!Array.isArray(wire))
            throw new DriverError("parse", "Incus returned a non-list of profiles");

        return wire.map(mapProfile).filter((p): p is Profile => p !== null);
    }

    async listNetworks(): Promise<Network[]> {
        const wire = await this.client.request<WireNetwork[]>("/1.0/networks?recursion=1");
        if (!Array.isArray(wire))
            throw new DriverError("parse", "Incus returned a non-list of networks");

        return wire.map(mapNetwork).filter((n): n is Network => n !== null);
    }

    async listStoragePools(): Promise<StoragePool[]> {
        const wire = await this.client.request<WireStoragePool[]>("/1.0/storage-pools?recursion=1");
        if (!Array.isArray(wire))
            throw new DriverError("parse", "Incus returned a non-list of storage pools");

        return wire.map(mapStoragePool).filter((s): s is StoragePool => s !== null);
    }

    /**
     * Metrics come from the instance state already fetched by listContainers
     * rather than from /1.0/metrics.
     *
     * /1.0/metrics returns OpenMetrics text covering every instance, which needs
     * a text parser for data the recursion=2 payload already carries. Phase 6
     * revisits this if the richer per-subsystem breakdown turns out to be worth
     * the second request.
     */
    async getMetrics(): Promise<Map<string, Metrics>> {
        const wire = await this.client.request<WireInstance[]>("/1.0/instances?recursion=2");
        if (!Array.isArray(wire))
            throw new DriverError("parse", "Incus returned a non-list of instances");

        const metrics = new Map<string, Metrics>();
        for (const instance of wire) {
            if (!isContainer(instance) || typeof instance.name !== "string")
                continue;
            metrics.set(instance.name, mapMetrics(instance));
        }
        return metrics;
    }

    /* Phase 3: lifecycle and events. */

    setState(_name: string, _action: string, _options?: SetStateOptions): Promise<void> {
        return Promise.resolve(notImplemented("Phase 3", "setState"));
    }

    createContainer(_spec: CreateContainerSpec): Promise<void> {
        return Promise.resolve(notImplemented("Phase 3", "createContainer"));
    }

    deleteContainer(_name: string): Promise<void> {
        return Promise.resolve(notImplemented("Phase 3", "deleteContainer"));
    }

    renameContainer(_name: string, _newName: string): Promise<void> {
        return Promise.resolve(notImplemented("Phase 3", "renameContainer"));
    }

    subscribeEvents(_handlers: EventHandlers): () => void {
        // Returning a no-op unsubscribe keeps callers from having to special-case
        // the unimplemented phase in their cleanup path.
        return () => undefined;
    }

    /* Phase 4: terminal. */

    openTerminal(_name: string, _mode: TerminalMode): TerminalHandle {
        return notImplemented("Phase 4", "openTerminal");
    }

    /* Phase 5: configuration writes. */

    updateConfig(_name: string, _config: ContainerConfig, _etag: string): Promise<void> {
        return Promise.resolve(notImplemented("Phase 5", "updateConfig"));
    }

    patchConfig(_name: string, _partial: Readonly<ContainerConfig>): Promise<void> {
        return Promise.resolve(notImplemented("Phase 5", "patchConfig"));
    }

    /* Phase 6: snapshots and images. */

    listSnapshots(_name: string): Promise<Snapshot[]> {
        return Promise.resolve(notImplemented("Phase 6", "listSnapshots"));
    }

    createSnapshot(_name: string, _snapshot: string, _stateful: boolean): Promise<void> {
        return Promise.resolve(notImplemented("Phase 6", "createSnapshot"));
    }

    restoreSnapshot(_name: string, _snapshot: string): Promise<void> {
        return Promise.resolve(notImplemented("Phase 6", "restoreSnapshot"));
    }

    deleteSnapshot(_name: string, _snapshot: string): Promise<void> {
        return Promise.resolve(notImplemented("Phase 6", "deleteSnapshot"));
    }

    listImages(): Promise<Image[]> {
        return Promise.resolve(notImplemented("Phase 6", "listImages"));
    }
}

/** Re-exported so callers can catch it without reaching into the errors module. */
export { ConflictError };
