/**
 * Raw Incus wire shapes.
 *
 * These mirror what the API actually returns, verified against Incus 6.23 on
 * Rocky Linux 10.2. They are deliberately separate from the domain types in
 * ../types.ts: the mapping between the two is the one place that has to change
 * when Incus changes its representation, and keeping the wire format out of the
 * UI is most of what the backend boundary is for.
 *
 * Everything here is untrusted input. Almost every field is optional even where
 * Incus always sends it, because the type system is the only thing standing
 * between a malformed response and a crashed page, and `name` is the sole field
 * the mapping refuses to proceed without.
 */

export interface WireAddress {
    family?: string;
    address?: string;
    /** A string even for IPv6 prefix lengths, where Incus sends "64". */
    netmask?: string;
    scope?: string;
}

export interface WireNetworkState {
    addresses?: WireAddress[];
    counters?: Record<string, number>;
    host_name?: string;
    hwaddr?: string;
    mtu?: number;
    state?: string;
    type?: string;
}

export interface WireInstanceState {
    status?: string;
    status_code?: number;
    pid?: number;
    processes?: number;
    started_at?: string;
    network?: Record<string, WireNetworkState> | null;
    memory?: {
        usage?: number;
        usage_peak?: number;
        total?: number;
        swap_usage?: number;
        swap_usage_peak?: number;
    };
    cpu?: { usage?: number; allocated_time?: number };
    disk?: Record<string, { usage?: number; total?: number }> | null;
}

export interface WireInstance {
    name?: string;
    /** "container" or "virtual-machine". Virtual machines are filtered out. */
    type?: string;
    status?: string;
    status_code?: number;
    architecture?: string;
    ephemeral?: boolean;
    created_at?: string;
    last_used_at?: string;
    description?: string;
    location?: string;
    project?: string;
    profiles?: string[];
    /** Keys set on the instance itself. Empty when everything comes from a profile. */
    config?: Record<string, string>;
    devices?: Record<string, Record<string, string>>;
    /** Instance keys merged with the applied profiles. This is the effective set. */
    expanded_config?: Record<string, string>;
    expanded_devices?: Record<string, Record<string, string>>;
    state?: WireInstanceState | null;
}

export interface WireProfile {
    name?: string;
    description?: string;
    config?: Record<string, string>;
    devices?: Record<string, Record<string, string>>;
    /** URL paths such as "/1.0/instances/web01", not bare names. */
    used_by?: string[];
}

export interface WireNetwork {
    name?: string;
    type?: string;
    managed?: boolean;
    description?: string;
    /** Empty string on unmanaged networks, which have no lifecycle of their own. */
    status?: string;
    config?: Record<string, string>;
    used_by?: string[];
}

export interface WireStoragePool {
    name?: string;
    driver?: string;
    description?: string;
    status?: string;
    config?: Record<string, string>;
    used_by?: string[];
}

export interface WireServerEnvironment {
    server?: string;
    server_version?: string;
    server_name?: string;
    kernel?: string;
    kernel_version?: string;
    kernel_architecture?: string;
    os_name?: string;
    os_version?: string;
    /** The container runtime behind Incus, "lxc" for system containers. */
    driver?: string;
    driver_version?: string;
    storage?: string;
    storage_version?: string;
}

export interface WireServerInfo {
    api_version?: string;
    /** "trusted", "untrusted", or "guest". */
    auth?: string;
    api_extensions?: string[];
    environment?: WireServerEnvironment;
}

export interface WireOperation {
    id?: string;
    class?: string;
    status?: string;
    status_code?: number;
    err?: string;
    /** Operation-specific progress payload, for example download_progress. */
    metadata?: Record<string, unknown> | null;
}

export interface WireSnapshot {
    name?: string;
    created_at?: string;
    stateful?: boolean;
    expires_at?: string;
}

export interface WireImage {
    fingerprint?: string;
    aliases?: { name?: string; description?: string }[];
    architecture?: string;
    size?: number;
    uploaded_at?: string;
    properties?: Record<string, string>;
}

/**
 * Incus operation status codes.
 *
 * Only the terminal three matter to the operation waiter; the rest are listed so
 * that a reader does not have to guess what an intermediate code means.
 */
export const OperationStatus = {
    Created: 100,
    Started: 101,
    Stopped: 102,
    Running: 103,
    Cancelling: 104,
    Pending: 105,
    Starting: 106,
    Stopping: 107,
    Aborting: 108,
    Freezing: 109,
    Frozen: 110,
    Thawed: 111,
    Error: 112,
    /** Terminal: the operation completed. */
    Success: 200,
    /** Terminal: the operation failed; `err` carries the reason. */
    Failure: 400,
    /** Terminal: the operation was cancelled. */
    Cancelled: 401,
} as const;
