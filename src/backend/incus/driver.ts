import type { ContainerDriver, EventHandlers, SetStateOptions } from "../driver";
import { ApiError, ConflictError, DriverError } from "../errors";
import type {
    Container,
    ContainerConfig,
    ContainerUpdate,
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
import { subscribeLifecycle } from "./events";
import { openTerminal } from "./terminal";

/**
 * Image servers by remote name.
 *
 * Incus stores remotes client-side, so the daemon cannot resolve "images:" for
 * us. Only the one remote a stock install ships with is mapped; anything else
 * falls back to it rather than failing, since a wrong server produces a clear
 * "image not found" while an unmapped name would produce a confusing crash.
 */
const IMAGE_SERVERS: Record<string, string> = {
    images: "https://images.linuxcontainers.org",
};

/**
 * Keys where the operator's edit and the server's current value disagree.
 *
 * Only genuine divergence counts: a key the operator left alone is not a
 * conflict just because someone else changed it, and listing those would bury
 * the real ones.
 */
const divergedKeys = (
    mine: Record<string, string>,
    theirs: Record<string, string>,
): string[] => {
    const keys = new Set([...Object.keys(mine), ...Object.keys(theirs)]);
    return [...keys]
        .filter((key) => mine[key] !== theirs[key])
        // volatile.* is managed by Incus and changes on its own; reporting it
        // would make every conflict dialog look worse than it is.
        .filter((key) => !key.startsWith("volatile."))
        .sort();
};
import {
    isContainer,
    mapContainer,
    mapImage,
    mapMetrics,
    mapNetwork,
    mapProfile,
    mapServerInfo,
    mapSnapshot,
    mapStoragePool,
} from "./map";
import type {
    WireImage,
    WireInstance,
    WireNetwork,
    WireProfile,
    WireServerInfo,
    WireSnapshot,
    WireStoragePool,
} from "./wire";

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

    /**
     * Change run state.
     *
     * `stateful` is pinned false: a stateful stop needs CRIU, which is not
     * present on a stock host, and asking for it turns a working stop into a
     * confusing failure.
     */
    async setState(
        name: string,
        action: "start" | "stop" | "restart" | "freeze" | "unfreeze",
        options: SetStateOptions = {},
    ): Promise<void> {
        await this.client.request<unknown>(
            `/1.0/instances/${encodeURIComponent(name)}/state`,
            {
                method: "PUT",
                body: {
                    action,
                    force: options.force ?? false,
                    timeout: options.timeout ?? 30,
                    stateful: false,
                },
            },
        );
    }

    async createContainer(spec: CreateContainerSpec): Promise<void> {
        /*
         * The remote name is a client-side concept; the API wants a concrete
         * server and protocol. "local" means an image already pulled onto this
         * host, anything else is treated as a simplestreams image server.
         */
        const source = spec.remote === "local"
            ? { type: "image", alias: spec.image }
            : {
                type: "image",
                protocol: "simplestreams",
                server: IMAGE_SERVERS[spec.remote] ?? IMAGE_SERVERS["images"],
                alias: spec.image,
            };

        await this.client.request<unknown>("/1.0/instances", {
            method: "POST",
            body: {
                name: spec.name,
                type: "container",
                source,
                profiles: spec.profiles.length > 0 ? spec.profiles : ["default"],
                config: spec.config,
                ephemeral: spec.ephemeral,
            },
        });

        if (spec.start)
            await this.setState(spec.name, "start");
    }

    /**
     * Delete a container and its snapshots.
     *
     * Incus refuses to delete a running instance, but this checks first so that
     * the operator gets a sentence explaining why rather than a raw API error,
     * and so the plugin never has a reason to reach for a force-stop on a path
     * whose whole purpose is destruction.
     */
    async deleteContainer(name: string): Promise<void> {
        const { container } = await this.getContainer(name);
        if (container.state !== "Stopped") {
            throw new ApiError(
                400,
                `${name} is ${container.state.toLowerCase()}. Stop it before deleting it.`,
            );
        }

        await this.client.request<unknown>(`/1.0/instances/${encodeURIComponent(name)}`, {
            method: "DELETE",
        });
    }

    async renameContainer(name: string, newName: string): Promise<void> {
        await this.client.request<unknown>(`/1.0/instances/${encodeURIComponent(name)}`, {
            method: "POST",
            body: { name: newName },
        });
    }

    subscribeEvents(handlers: EventHandlers): () => void {
        return subscribeLifecycle(handlers);
    }

    /**
     * Open an interactive pty into a running container.
     *
     * The caller owns the returned handle and must close() it on unmount. An
     * orphaned pty is a process left running on the host, and Cockpit gives no
     * guarantee the iframe survives navigation, so nothing else will reap it.
     */
    openTerminal(name: string, mode: TerminalMode): TerminalHandle {
        return openTerminal(name, mode);
    }

    /**
     * Replace the editable half of an instance, guarded by its ETag.
     *
     * The whole ContainerUpdate goes back, not just the map the form touched.
     * Incus's PUT is a replace: a body carrying only `config` leaves the
     * instance with no devices and the operation fails with "no root device
     * could be found". Verified against Incus 6.23.
     */
    async updateConfig(
        name: string,
        update: ContainerUpdate,
        etag: string,
    ): Promise<void> {
        try {
            await this.client.request<unknown>(
                `/1.0/instances/${encodeURIComponent(name)}`,
                {
                    method: "PUT",
                    headers: { "If-Match": etag },
                    body: {
                        architecture: update.architecture,
                        description: update.description,
                        ephemeral: update.ephemeral,
                        profiles: update.profiles,
                        config: update.config,
                        devices: update.devices,
                        // A stateful write needs CRIU, which a stock host does
                        // not have, and asking for it fails the whole update.
                        stateful: false,
                    },
                },
            );
        } catch (error) {
            if (error instanceof ApiError && error.status === 412) {
                /*
                 * The instance changed under the edit. Refetch and report only
                 * the keys that actually diverged, so the operator sees the real
                 * conflict instead of a wall of untouched settings, and so their
                 * input is never silently discarded.
                 */
                const { container } = await this.getContainer(name);
                const conflicts = divergedKeys(update.config, container.localConfig);
                throw new ConflictError(conflicts, container);
            }
            throw error;
        }
    }

    /**
     * Merge a partial configuration.
     *
     * No ETag round trip: a merge of disjoint keys cannot clobber a concurrent
     * edit. It also cannot remove a key, which is why the forms use PUT.
     */
    async patchConfig(name: string, partial: Readonly<ContainerConfig>): Promise<void> {
        await this.client.request<unknown>(`/1.0/instances/${encodeURIComponent(name)}`, {
            method: "PATCH",
            body: { config: partial },
        });
    }

    async listSnapshots(name: string): Promise<Snapshot[]> {
        const wire = await this.client.request<WireSnapshot[]>(
            `/1.0/instances/${encodeURIComponent(name)}/snapshots?recursion=1`,
        );
        if (!Array.isArray(wire))
            throw new DriverError("parse", "Incus returned a non-list of snapshots");

        return wire.map(mapSnapshot).filter((s): s is Snapshot => s !== null);
    }

    /**
     * `stateful` captures the running process state and needs CRIU. It is
     * offered rather than pinned off because a host that has CRIU can use it,
     * but the UI has to make clear it will fail without.
     */
    async createSnapshot(name: string, snapshot: string, stateful: boolean): Promise<void> {
        await this.client.request<unknown>(
            `/1.0/instances/${encodeURIComponent(name)}/snapshots`,
            { method: "POST", body: { name: snapshot, stateful } },
        );
    }

    /**
     * Restore is a PUT on the instance carrying only `restore`, not an endpoint
     * of its own. Unlike a configuration PUT it needs no other fields.
     */
    async restoreSnapshot(name: string, snapshot: string): Promise<void> {
        await this.client.request<unknown>(`/1.0/instances/${encodeURIComponent(name)}`, {
            method: "PUT",
            body: { restore: snapshot },
        });
    }

    async deleteSnapshot(name: string, snapshot: string): Promise<void> {
        await this.client.request<unknown>(
            `/1.0/instances/${encodeURIComponent(name)}/snapshots/${encodeURIComponent(snapshot)}`,
            { method: "DELETE" },
        );
    }

    async listImages(): Promise<Image[]> {
        const wire = await this.client.request<WireImage[]>("/1.0/images?recursion=1");
        if (!Array.isArray(wire))
            throw new DriverError("parse", "Incus returned a non-list of images");

        return wire.map(mapImage).filter((i): i is Image => i !== null);
    }
}

/** Re-exported so callers can catch it without reaching into the errors module. */
export { ConflictError };
