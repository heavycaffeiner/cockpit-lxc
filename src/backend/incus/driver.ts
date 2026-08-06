import type { ContainerDriver, EventHandlers, SetStateOptions } from "../driver";
import { ApiError, ConflictError, DriverError } from "../errors";
import type {
    Container,
    ContainerConfig,
    ContainerUpdate,
    CreateContainerSpec,
    Image,
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
} from "../types";
import { IncusClient } from "./client";
import { subscribeLifecycle } from "./events";
import { listRemoteImages, listRemotes } from "./remotes";
import { openTerminal } from "./terminal";

/**
 * The image server a stock install ships with.
 *
 * Used only when the CLI's remote list cannot be read or does not name the
 * remote being asked for. A wrong server produces a clear "image not found",
 * whereas failing outright would break a pull for a host whose CLI config is
 * unreadable for some unrelated reason.
 */
const DEFAULT_IMAGE_SERVER = "https://images.linuxcontainers.org";

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

    /**
     * Where a remote name points.
     *
     * The daemon has no idea what "images:" means, so the address has to come
     * from the CLI's own remote list. Reading it per pull rather than caching it
     * keeps a remote added while the page is open usable without a reload, and a
     * pull is already a network operation measured in seconds.
     */
    private async imageServer(remote: string): Promise<{ server: string; protocol: string }> {
        try {
            const match = (await listRemotes()).find((entry) => entry.name === remote);
            if (match !== undefined && match.address !== "" && !match.isLocal) {
                return {
                    server: match.address,
                    protocol: match.protocol === "" ? "simplestreams" : match.protocol,
                };
            }
        } catch {
            // The CLI could not be read. The default server is a better answer
            // than refusing to pull at all.
        }
        return { server: DEFAULT_IMAGE_SERVER, protocol: "simplestreams" };
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

    async createProfile(name: string, update: ResourceUpdate): Promise<void> {
        await this.client.request<unknown>("/1.0/profiles", {
            method: "POST",
            body: {
                name,
                description: update.description,
                config: update.config,
                devices: update.devices ?? {},
            },
        });
    }

    /**
     * Replace a profile.
     *
     * PUT rather than PATCH for the same reason the instance forms use it: a key
     * dropped from the form has to be removed, and PATCH cannot express removal.
     */
    async updateProfile(name: string, update: ResourceUpdate): Promise<void> {
        await this.client.request<unknown>(`/1.0/profiles/${encodeURIComponent(name)}`, {
            method: "PUT",
            body: {
                description: update.description,
                config: update.config,
                devices: update.devices ?? {},
            },
        });
    }

    /**
     * Delete a profile.
     *
     * Incus refuses while containers still apply it, and that refusal is the
     * right one: silently detaching a profile from running containers would
     * change their configuration without anyone asking.
     */
    async deleteProfile(name: string): Promise<void> {
        await this.client.request<unknown>(`/1.0/profiles/${encodeURIComponent(name)}`, {
            method: "DELETE",
        });
    }

    async listNetworks(): Promise<Network[]> {
        const wire = await this.client.request<WireNetwork[]>("/1.0/networks?recursion=1");
        if (!Array.isArray(wire))
            throw new DriverError("parse", "Incus returned a non-list of networks");

        return wire.map(mapNetwork).filter((n): n is Network => n !== null);
    }

    async createNetwork(name: string, type: string, update: ResourceUpdate): Promise<void> {
        await this.client.request<unknown>("/1.0/networks", {
            method: "POST",
            body: {
                name,
                type,
                description: update.description,
                config: update.config,
            },
        });
    }

    async updateNetwork(name: string, update: ResourceUpdate): Promise<void> {
        await this.client.request<unknown>(`/1.0/networks/${encodeURIComponent(name)}`, {
            method: "PUT",
            body: { description: update.description, config: update.config },
        });
    }

    async deleteNetwork(name: string): Promise<void> {
        await this.client.request<unknown>(`/1.0/networks/${encodeURIComponent(name)}`, {
            method: "DELETE",
        });
    }

    async listStoragePools(): Promise<StoragePool[]> {
        const wire = await this.client.request<WireStoragePool[]>("/1.0/storage-pools?recursion=1");
        if (!Array.isArray(wire))
            throw new DriverError("parse", "Incus returned a non-list of storage pools");

        return wire.map(mapStoragePool).filter((s): s is StoragePool => s !== null);
    }

    async createStoragePool(
        name: string,
        driver: string,
        update: ResourceUpdate,
    ): Promise<void> {
        await this.client.request<unknown>("/1.0/storage-pools", {
            method: "POST",
            body: {
                name,
                driver,
                description: update.description,
                config: update.config,
            },
        });
    }

    async updateStoragePool(name: string, update: ResourceUpdate): Promise<void> {
        await this.client.request<unknown>(`/1.0/storage-pools/${encodeURIComponent(name)}`, {
            method: "PUT",
            body: { description: update.description, config: update.config },
        });
    }

    /**
     * Delete a storage pool.
     *
     * This destroys the pool's backing store. Incus refuses while any volume
     * lives on it, which is what keeps the guard meaningful rather than advisory.
     */
    async deleteStoragePool(name: string): Promise<void> {
        await this.client.request<unknown>(`/1.0/storage-pools/${encodeURIComponent(name)}`, {
            method: "DELETE",
        });
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
         * A local image is named either way. Incus takes `alias` or
         * `fingerprint` but not one under the other's name, and an image that
         * was pulled without an alias has only its fingerprint, so which field
         * to send is decided by the shape of the value rather than by asking
         * the caller to track it.
         */
        const source = /^[0-9a-f]{64}$/.test(spec.image)
            ? { type: "image", fingerprint: spec.image }
            : { type: "image", alias: spec.image };

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

    /**
     * Copy a container.
     *
     * The source is expressed as a `copy` source rather than an image, which is
     * what makes this a clone of the running configuration and disk rather than
     * a fresh instance from the original image.
     */
    async copyContainer(name: string, newName: string): Promise<void> {
        await this.client.request<unknown>("/1.0/instances", {
            method: "POST",
            body: {
                name: newName,
                source: { type: "copy", source: name },
            },
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

    async renameSnapshot(name: string, snapshot: string, newName: string): Promise<void> {
        await this.client.request<unknown>(
            `/1.0/instances/${encodeURIComponent(name)}/snapshots/${encodeURIComponent(snapshot)}`,
            { method: "POST", body: { name: newName } },
        );
    }

    async deleteSnapshot(name: string, snapshot: string): Promise<void> {
        await this.client.request<unknown>(
            `/1.0/instances/${encodeURIComponent(name)}/snapshots/${encodeURIComponent(snapshot)}`,
            { method: "DELETE" },
        );
    }

    /**
     * The instance's log files.
     *
     * Incus answers with a list of URLs rather than of names, so the last path
     * segment is the file. An instance that has never run has no log directory
     * and Incus answers 404; that is an empty list, not a failure.
     *
     * The list is shorter than the log directory: Incus serves lxc.log and
     * rejects the rest, `console.log` included, with "log file name not valid".
     * That is the API's decision, not a filter applied here. The console output
     * is reachable live through the Console tab instead.
     */
    async listLogs(name: string): Promise<LogFile[]> {
        const path = `/1.0/instances/${encodeURIComponent(name)}/logs`;

        let wire: string[];
        try {
            wire = await this.client.request<string[]>(path);
        } catch (error) {
            if (error instanceof ApiError && error.status === 404)
                return [];
            throw error;
        }

        if (!Array.isArray(wire))
            return [];

        return wire
            .filter((entry): entry is string => typeof entry === "string")
            .map((entry) => {
                const last = entry.split("/").filter((s) => s !== "").pop() ?? entry;
                return { name: decodeURIComponent(last), size: null };
            })
            .sort((a, b) => a.name.localeCompare(b.name));
    }

    /**
     * The tail of one log file.
     *
     * The body is the file itself rather than an envelope, so it is read raw.
     * Only the tail is kept: a console log grows without bound, and rendering
     * megabytes of it into the DOM would hang the page to show the part nobody
     * asked for.
     */
    async readLog(name: string, file: string, tailLines: number): Promise<string> {
        const text = await this.client.text(
            `/1.0/instances/${encodeURIComponent(name)}/logs/${encodeURIComponent(file)}`,
        );

        const lines = text.split("\n");
        return lines.length <= tailLines ? text : lines.slice(-tailLines).join("\n");
    }

    async listImages(): Promise<Image[]> {
        const wire = await this.client.request<WireImage[]>("/1.0/images?recursion=1");
        if (!Array.isArray(wire))
            throw new DriverError("parse", "Incus returned a non-list of images");

        return wire.map(mapImage).filter((i): i is Image => i !== null);
    }

    listRemotes(): Promise<Remote[]> {
        return listRemotes();
    }

    listRemoteImages(remote: string): Promise<RemoteImage[]> {
        return listRemoteImages(remote);
    }

    /**
     * Pull an image onto this host.
     *
     * Progress is reported through the operation's metadata while the download
     * runs, which is the only feedback available for something that can take
     * minutes on a slow link.
     */
    async pullImage(
        alias: string,
        remote: string,
        onProgress?: (text: string) => void,
    ): Promise<void> {
        await this.client.request<unknown>("/1.0/images", {
            method: "POST",
            body: {
                source: {
                    type: "image",
                    mode: "pull",
                    alias,
                    ...await this.imageServer(remote),
                },
                // Cached rather than public: the image is for this host's use,
                // not for serving on to others.
                public: false,
                auto_update: false,
            },
            ...(onProgress === undefined ? {} : {
                onProgress: (metadata) => {
                    const progress = metadata?.["download_progress"];
                    if (typeof progress === "string")
                        onProgress(progress);
                },
            }),
        });
    }

    async deleteImage(fingerprint: string): Promise<void> {
        await this.client.request<unknown>(
            `/1.0/images/${encodeURIComponent(fingerprint)}`,
            { method: "DELETE" },
        );
    }

    /**
     * Give a local image a name.
     *
     * A cached image has no alias, so its only handle is a 64-character
     * fingerprint. An alias is what makes it usable in the create dialog.
     */
    async createImageAlias(
        fingerprint: string,
        alias: string,
        description: string,
    ): Promise<void> {
        await this.client.request<unknown>("/1.0/images/aliases", {
            method: "POST",
            body: { name: alias, target: fingerprint, description },
        });
    }

    async deleteImageAlias(alias: string): Promise<void> {
        await this.client.request<unknown>(
            `/1.0/images/aliases/${encodeURIComponent(alias)}`,
            { method: "DELETE" },
        );
    }
}

/** Re-exported so callers can catch it without reaching into the errors module. */
export { ConflictError };
