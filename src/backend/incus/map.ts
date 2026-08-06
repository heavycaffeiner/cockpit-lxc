import type {
    ConfigSchema,
    Container,
    ContainerInterface,
    ContainerState,
    Image,
    Metrics,
    Network,
    NetworkAddress,
    OptionSpec,
    OptionType,
    Profile,
    ServerInfo,
    Snapshot,
    StoragePool,
} from "../types";
import type {
    WireConfigMetadata,
    WireConfigOption,
    WireImage,
    WireInstance,
    WireNetwork,
    WireNetworkState,
    WireProfile,
    WireServerInfo,
    WireSnapshot,
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
         * The effective configuration for display, and the instance-local one
         * for writing. `config` is empty on an instance that takes everything
         * from a profile, so showing it would report no memory limit on a
         * container whose profile sets one; writing the expanded map back would
         * copy every profile value onto the instance instead.
         */
        config: wire.expanded_config ?? wire.config ?? {},
        localConfig: wire.config ?? {},
        devices: wire.expanded_devices ?? wire.devices ?? {},
        localDevices: wire.devices ?? {},
        interfaces: mapInterfaces(wire),
        metrics: wire.state?.status_code === OperationStatus.Running
            ? mapMetrics(wire)
            : null,
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
 * Incus reports `int64` alongside `integer`, and is free to add a type this
 * code has not seen. An unknown type becomes a text field, which accepts
 * anything and lets the server be the judge, rather than dropping the option.
 */
const optionType = (wire: string | undefined): OptionType => {
    switch (wire) {
        case "bool":
            return "bool";
        case "integer":
        case "int64":
            return "integer";
        case "blob":
            return "blob";
        default:
            return "string";
    }
};

/**
 * Whether an option belongs on a system container's form.
 *
 * Ordered so the cheapest and most decisive rejections come first. A wildcard is
 * a family rather than a setting and has no single value to bind a control to;
 * volatile is Incus's own and rejects writes; oci and the qemu raw keys belong
 * to instance types section 3.2 of the first proposal puts out of scope.
 *
 * "unprivileged container" is kept rather than rejected. It is the normal state
 * of the containers this manages, and hiding a real setting on a condition that
 * is usually satisfied would lose more than it protects.
 */
const appliesToContainer = (group: string, key: string, wire: WireConfigOption): boolean => {
    if (key.includes("*"))
        return false;
    if (group === "volatile" || group === "oci")
        return false;
    if (key.startsWith("raw.qemu"))
        return false;
    return !(wire.condition ?? "").toLowerCase().includes("virtual machine");
};

/**
 * Incus's configuration table, reduced to what a container form can render.
 *
 * Returns null rather than an empty schema when the body is not the shape this
 * expects, so the caller can tell "the server did not describe itself" from
 * "the server describes nothing", and degrade rather than render an empty form.
 */
export const mapConfigSchema = (wire: WireConfigMetadata): ConfigSchema | null => {
    const instance = wire.configs?.instance;
    if (typeof instance !== "object" || instance === null)
        return null;

    const byKey = new Map<string, OptionSpec>();
    const groups: { name: string; options: OptionSpec[] }[] = [];

    for (const [group, body] of Object.entries(instance)) {
        const options: OptionSpec[] = [];

        for (const entry of body?.keys ?? []) {
            // The option's name is the sole property name of the entry, not a
            // field within it.
            for (const [key, meta] of Object.entries(entry ?? {})) {
                if (!appliesToContainer(group, key, meta))
                    continue;

                const spec: OptionSpec = {
                    key,
                    group,
                    type: optionType(meta.type),
                    description: meta.shortdesc ?? "",
                    detail: meta.longdesc ?? "",
                    defaultText: meta.defaultdesc ?? "",
                    liveUpdate: meta.liveupdate === "yes",
                    unprivilegedOnly: (meta.condition ?? "").toLowerCase().includes("unprivileged"),
                };
                options.push(spec);
                byKey.set(key, spec);
            }
        }

        if (options.length > 0) {
            options.sort((a, b) => a.key.localeCompare(b.key));
            groups.push({ name: group, options });
        }
    }

    if (byKey.size === 0)
        return null;

    groups.sort((a, b) => a.name.localeCompare(b.name));
    return { byKey, groups };
};

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

/**
 * Incus sends the zero time when a snapshot has no expiry. Passing that through
 * would render as the year 1, which reads as a bug rather than as "never".
 */
const ZERO_TIME_PREFIX = "0001-01-01";

export const mapSnapshot = (wire: WireSnapshot): Snapshot | null => {
    if (typeof wire.name !== "string" || wire.name === "")
        return null;

    const expires = wire.expires_at;
    return {
        name: wire.name,
        createdAt: wire.created_at ?? "",
        stateful: wire.stateful ?? false,
        expiresAt: typeof expires === "string" && !expires.startsWith(ZERO_TIME_PREFIX)
            ? expires
            : null,
    };
};

export const mapImage = (wire: WireImage): Image | null => {
    if (typeof wire.fingerprint !== "string" || wire.fingerprint === "")
        return null;

    return {
        fingerprint: wire.fingerprint,
        aliases: (wire.aliases ?? [])
            .map((alias) => alias.name)
            .filter((name): name is string => typeof name === "string" && name !== ""),
        // Cached images carry no alias, so the description is the only human
        // name they have.
        description: wire.properties?.["description"] ?? "",
        architecture: wire.architecture ?? "",
        size: wire.size ?? 0,
        uploadedAt: wire.uploaded_at ?? "",
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
