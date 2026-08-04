import type {
    Container,
    ContainerInterface,
    ContainerState,
    Metrics,
    Network,
    NetworkAddress,
    Profile,
    ServerInfo,
    StoragePool,
} from "../types";
import type {
    WireInstance,
    WireNetwork,
    WireNetworkState,
    WireProfile,
    WireServerInfo,
    WireStoragePool,
} from "./wire";
import { OperationStatus } from "./wire";

/**
 * Instance status, derived from `status_code` rather than the `status` string.
 *
 * Incus sends both. The code is the stable one: the string is a display label
 * and Incus is free to reword it, whereas the codes are part of the API. Any
 * code the plugin does not know maps to "Unknown", never to "Error", because
 * telling an operator a healthy container has failed is worse than admitting
 * the state is unrecognised.
 */
export const mapState = (code: number | undefined): ContainerState => {
    switch (code) {
        case OperationStatus.Running:
            return "Running";
        case OperationStatus.Stopped:
            return "Stopped";
        case OperationStatus.Frozen:
            return "Frozen";
        case OperationStatus.Starting:
        case OperationStatus.Started:
            return "Starting";
        case OperationStatus.Stopping:
            return "Stopping";
        case OperationStatus.Freezing:
            return "Freezing";
        case OperationStatus.Thawed:
            return "Running";
        case OperationStatus.Error:
            return "Error";
        default:
            return "Unknown";
    }
};

const mapAddresses = (state: WireNetworkState): NetworkAddress[] =>
    (state.addresses ?? [])
        .filter((address) => typeof address.address === "string" && address.address !== "")
        .map((address) => ({
            family: address.family === "inet" ? "inet" : "inet6",
            address: address.address ?? "",
            netmask: address.netmask ?? "",
            scope: address.scope ?? "",
        }));

const mapInterfaces = (wire: WireInstance): ContainerInterface[] => {
    const network = wire.state?.network;
    if (network === undefined || network === null)
        return [];

    return Object.entries(network)
        // The loopback interface is real but never what an operator is looking
        // for in a container list, and showing 127.0.0.1 for every row is noise.
        .filter(([name]) => name !== "lo")
        .map(([name, state]) => ({
            name,
            hwaddr: state.hwaddr ?? "",
            mtu: state.mtu ?? 0,
            addresses: mapAddresses(state),
        }));
};

/**
 * Map an instance.
 *
 * Returns null when the payload carries no usable name, which is the one field
 * nothing downstream can work without. Dropping the row is better than
 * rendering a nameless entry that cannot be acted on.
 */
export const mapContainer = (wire: WireInstance): Container | null => {
    if (typeof wire.name !== "string" || wire.name === "")
        return null;

    return {
        name: wire.name,
        state: mapState(wire.status_code ?? wire.state?.status_code),
        description: wire.description ?? "",
        architecture: wire.architecture ?? "",
        ephemeral: wire.ephemeral ?? false,
        createdAt: wire.created_at ?? "",
        profiles: wire.profiles ?? [],
        /*
         * The effective configuration, not the instance-local one. `config` is
         * empty on an instance that takes everything from a profile, so showing
         * it would tell an operator a container has no memory limit when its
         * profile sets one.
         */
        config: wire.expanded_config ?? wire.config ?? {},
        devices: wire.expanded_devices ?? wire.devices ?? {},
        interfaces: mapInterfaces(wire),
    };
};

/** True for system containers. Virtual machines are out of scope. */
export const isContainer = (wire: WireInstance): boolean => wire.type === "container";

export const mapServerInfo = (wire: WireServerInfo): ServerInfo => ({
    apiVersion: wire.api_version ?? "",
    serverVersion: wire.environment?.server_version ?? "",
    extensions: new Set(wire.api_extensions ?? []),
    trusted: wire.auth === "trusted",
});

/**
 * `used_by` entries are URL paths such as "/1.0/instances/web01", so the last
 * segment is the name. They can carry a query string when the object lives in a
 * non-default project, which is why the split happens before the decode.
 */
export const usedByNames = (usedBy: string[] | undefined): string[] =>
    (usedBy ?? []).map((url) => {
        const withoutQuery = url.split("?")[0] ?? url;
        const segments = withoutQuery.split("/").filter((segment) => segment !== "");
        const last = segments[segments.length - 1];
        return last === undefined ? url : decodeURIComponent(last);
    });

export const mapProfile = (wire: WireProfile): Profile | null => {
    if (typeof wire.name !== "string" || wire.name === "")
        return null;

    return {
        name: wire.name,
        description: wire.description ?? "",
        config: wire.config ?? {},
        devices: wire.devices ?? {},
        usedBy: usedByNames(wire.used_by),
    };
};

export const mapNetwork = (wire: WireNetwork): Network | null => {
    if (typeof wire.name !== "string" || wire.name === "")
        return null;

    return {
        name: wire.name,
        type: wire.type ?? "",
        managed: wire.managed ?? false,
        description: wire.description ?? "",
        config: wire.config ?? {},
        usedBy: usedByNames(wire.used_by),
    };
};

export const mapStoragePool = (wire: WireStoragePool): StoragePool | null => {
    if (typeof wire.name !== "string" || wire.name === "")
        return null;

    return {
        name: wire.name,
        driver: wire.driver ?? "",
        description: wire.description ?? "",
        config: wire.config ?? {},
        usedBy: usedByNames(wire.used_by),
    };
};

export const mapMetrics = (wire: WireInstance): Metrics => {
    const state = wire.state;
    const disk = state?.disk ?? {};
    const diskUsed = Object.values(disk).reduce(
        (sum, entry) => sum + (entry?.usage ?? 0),
        0,
    );

    const counters = Object.entries(state?.network ?? {})
        .filter(([name]) => name !== "lo")
        .reduce(
            (totals, [, iface]) => ({
                rx: totals.rx + (iface.counters?.["bytes_received"] ?? 0),
                tx: totals.tx + (iface.counters?.["bytes_sent"] ?? 0),
            }),
            { rx: 0, tx: 0 },
        );

    return {
        // Incus reports CPU time in nanoseconds.
        cpuSecondsTotal: (state?.cpu?.usage ?? 0) / 1e9,
        memoryUsedBytes: state?.memory?.usage ?? 0,
        memoryTotalBytes: state?.memory?.total ?? 0,
        diskUsedBytes: diskUsed,
        networkReceiveBytes: counters.rx,
        networkTransmitBytes: counters.tx,
    };
};
