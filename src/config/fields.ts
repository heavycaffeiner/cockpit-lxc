/**
 * The typed configuration surface.
 *
 * Incus exposes over 150 instance options. These are the ones an operator
 * reaches for often enough that a labelled field beats typing a key by hand;
 * everything else stays reachable through the raw editor, which is what keeps
 * the "every setting is editable" promise true as Incus adds keys.
 */

export type FieldKind = "text" | "number" | "boolean" | "select" | "textarea";

export interface FieldSpec {
    key: string;
    label: string;
    kind: FieldKind;
    help: string;
    placeholder?: string;
    options?: readonly { value: string; label: string }[];
    /**
     * Incus API extension this key needs. The field is hidden when the server
     * does not advertise it, rather than rendered and rejected on submit.
     */
    extension?: string;
    validate?: (value: string) => string | null;
}

export interface FieldGroup {
    id: string;
    title: string;
    description: string;
    fields: readonly FieldSpec[];
}

/** Incus accepts a bare byte count or a suffixed size, and also percentages. */
const SIZE_PATTERN = /^\d+(\.\d+)?\s?(B|kB|MB|GB|TB|PB|EB|KiB|MiB|GiB|TiB|PiB|EiB)?$/;
const PERCENT_PATTERN = /^\d+(\.\d+)?%$/;

const validateSize = (value: string): string | null => {
    if (value === "")
        return null;
    if (SIZE_PATTERN.test(value.trim()))
        return null;
    return "Expected a size such as 512MiB, 2GiB or 1073741824";
};

const validateMemory = (value: string): string | null => {
    if (value === "" || PERCENT_PATTERN.test(value.trim()))
        return null;
    return validateSize(value);
};

/**
 * limits.cpu is either a count or a CPU set. Incus accepts "4", "0-3" and
 * "0,2,4", and rejecting one of those would be worse than accepting a typo.
 */
const validateCpu = (value: string): string | null => {
    const trimmed = value.trim();
    if (trimmed === "")
        return null;
    if (/^\d+$/.test(trimmed))
        return null;
    if (/^\d+(-\d+)?(,\d+(-\d+)?)*$/.test(trimmed))
        return null;
    return "Expected a count such as 4, or a CPU set such as 0-3 or 0,2,4";
};

const validatePositiveInteger = (value: string): string | null => {
    if (value === "")
        return null;
    return /^\d+$/.test(value.trim()) ? null : "Expected a whole number";
};

const validatePriority = (value: string): string | null => {
    if (value === "")
        return null;
    if (!/^\d+$/.test(value.trim()))
        return "Expected a whole number between 0 and 10";
    const n = Number(value);
    return n >= 0 && n <= 10 ? null : "Expected a whole number between 0 and 10";
};

const BOOLEAN_OPTIONS = [
    { value: "", label: "Inherited" },
    { value: "true", label: "Enabled" },
    { value: "false", label: "Disabled" },
] as const;

export const FIELD_GROUPS: readonly FieldGroup[] = [
    {
        id: "resources",
        title: "Resource limits",
        description: "Caps enforced through cgroups. An empty field inherits from the profile.",
        fields: [
            {
                key: "limits.cpu",
                label: "CPU",
                kind: "text",
                placeholder: "4 or 0-3",
                help: "A number of cores, or the exact cores to pin to.",
                validate: validateCpu,
            },
            {
                key: "limits.cpu.allowance",
                label: "CPU allowance",
                kind: "text",
                placeholder: "50% or 25ms/100ms",
                help: "A share of the available time, or a hard quota per period.",
            },
            {
                key: "limits.cpu.priority",
                label: "CPU priority",
                kind: "number",
                placeholder: "0-10",
                help: "Relative weight when containers compete for CPU.",
                validate: validatePriority,
            },
            {
                key: "limits.memory",
                label: "Memory",
                kind: "text",
                placeholder: "512MiB",
                help: "A size, or a percentage of the host's memory.",
                validate: validateMemory,
            },
            {
                key: "limits.memory.enforce",
                label: "Memory enforcement",
                kind: "select",
                help: "Hard kills on overcommit; soft allows it when the host has room.",
                options: [
                    { value: "", label: "Inherited" },
                    { value: "hard", label: "Hard" },
                    { value: "soft", label: "Soft" },
                ],
            },
            {
                key: "limits.memory.swap",
                label: "Allow swap",
                kind: "select",
                help: "Whether this container's pages may be swapped out.",
                options: [...BOOLEAN_OPTIONS],
            },
            {
                key: "limits.processes",
                label: "Process limit",
                kind: "number",
                placeholder: "2000",
                help: "Maximum number of processes.",
                validate: validatePositiveInteger,
            },
            {
                key: "limits.disk.priority",
                label: "Disk priority",
                kind: "number",
                placeholder: "0-10",
                help: "Relative I/O weight against other containers.",
                validate: validatePriority,
            },
            {
                key: "limits.network.priority",
                label: "Network priority",
                kind: "number",
                placeholder: "0-10",
                help: "Relative network weight against other containers.",
                validate: validatePriority,
            },
        ],
    },
    {
        id: "security",
        title: "Security",
        description:
            "A privileged container's root maps to the host's root. Turn it on only when " +
            "something in the container genuinely needs it.",
        fields: [
            {
                key: "security.privileged",
                label: "Privileged",
                kind: "select",
                help: "Runs without a UID mapping. Escaping such a container means host root.",
                options: [...BOOLEAN_OPTIONS],
            },
            {
                key: "security.nesting",
                label: "Nesting",
                kind: "select",
                help: "Allows containers inside this container.",
                options: [...BOOLEAN_OPTIONS],
            },
            {
                key: "security.protection.delete",
                label: "Delete protection",
                kind: "select",
                help: "Refuses deletion while set, including from the CLI.",
                options: [...BOOLEAN_OPTIONS],
            },
            {
                key: "security.idmap.isolated",
                label: "Isolated id map",
                kind: "select",
                help: "Gives this container a UID range shared with no other container.",
                options: [...BOOLEAN_OPTIONS],
            },
            {
                key: "security.syscalls.intercept.mknod",
                label: "Intercept mknod",
                kind: "select",
                help: "Lets the container create device nodes through Incus.",
                options: [...BOOLEAN_OPTIONS],
            },
        ],
    },
    {
        id: "boot",
        title: "Startup and shutdown",
        description: "What happens to this container when the host boots or stops it.",
        fields: [
            {
                key: "boot.autostart",
                label: "Start on boot",
                kind: "select",
                help: "Starts with the host. Unset follows Incus's own heuristic.",
                options: [...BOOLEAN_OPTIONS],
            },
            {
                key: "boot.autostart.priority",
                label: "Autostart priority",
                kind: "number",
                placeholder: "0",
                help: "Higher starts earlier.",
                validate: validatePositiveInteger,
            },
            {
                key: "boot.autostart.delay",
                label: "Autostart delay",
                kind: "number",
                placeholder: "0",
                help: "Seconds to wait after this container before starting the next.",
                validate: validatePositiveInteger,
            },
            {
                key: "boot.host_shutdown_timeout",
                label: "Shutdown timeout",
                kind: "number",
                placeholder: "30",
                help: "Seconds to wait for a clean stop before killing it.",
                validate: validatePositiveInteger,
            },
        ],
    },
    {
        id: "snapshots",
        title: "Automatic snapshots",
        description:
            "Incus can take snapshots on a schedule and expire them. Leave the schedule " +
            "empty to take snapshots only by hand.",
        fields: [
            {
                key: "snapshots.schedule",
                label: "Schedule",
                kind: "text",
                placeholder: "@daily or 0 6 * * *",
                help: "A cron expression, or one of @hourly, @daily, @weekly, @monthly.",
                extension: "snapshot_scheduling",
            },
            {
                key: "snapshots.schedule.stopped",
                label: "Snapshot while stopped",
                kind: "select",
                help: "Whether the schedule also applies when the container is not running.",
                options: [...BOOLEAN_OPTIONS],
                extension: "snapshot_scheduling",
            },
            {
                key: "snapshots.pattern",
                label: "Name pattern",
                kind: "text",
                placeholder: "snap%d",
                help: "How scheduled snapshots are named. Supports pongo2 templating.",
                extension: "snapshot_scheduling",
            },
            {
                key: "snapshots.expiry",
                label: "Expiry",
                kind: "text",
                placeholder: "2w",
                help: "How long a snapshot is kept, for example 6H, 3d, 2w, 1M, 1y.",
                extension: "snapshot_scheduling",
                validate: (value) =>
                    value === "" || /^(\d+[SMHdwmy])+$/.test(value.trim())
                        ? null
                        : "Expected a duration such as 6H, 3d, 2w, 1M or 1y",
            },
        ],
    },
    {
        id: "cloudinit",
        title: "cloud-init",
        description:
            "Applied on first boot by images that ship cloud-init. Images without it " +
            "ignore these entirely.",
        fields: [
            {
                key: "cloud-init.user-data",
                label: "User data",
                kind: "textarea",
                help: "A cloud-config document, starting with #cloud-config.",
            },
            {
                key: "cloud-init.network-config",
                label: "Network config",
                kind: "textarea",
                help: "A cloud-init network configuration document.",
            },
            {
                key: "cloud-init.vendor-data",
                label: "Vendor data",
                kind: "textarea",
                help: "Vendor data, merged with user data by cloud-init.",
            },
        ],
    },
];

/** Cross-field rules the API would reject, checked before a round trip. */
export const formLevelProblems = (config: Record<string, string>): string[] => {
    const problems: string[] = [];

    const swap = config["limits.memory.swap"];
    if ((swap === "true" || swap === "false") && !config["limits.memory"]) {
        problems.push(
            "A swap setting has no effect without a memory limit; set Memory or clear it.",
        );
    }

    if (config["limits.memory.enforce"] && !config["limits.memory"]) {
        problems.push(
            "Memory enforcement has no effect without a memory limit; set Memory or clear it.",
        );
    }

    if (config["security.privileged"] === "true" && config["security.idmap.isolated"] === "true") {
        problems.push(
            "A privileged container has no id map, so an isolated id map cannot apply.",
        );
    }

    const userData = config["cloud-init.user-data"];
    if (userData !== undefined && userData.trim() !== "" &&
        !userData.trimStart().startsWith("#cloud-config") &&
        !userData.trimStart().startsWith("#!")) {
        problems.push(
            "cloud-init user data usually has to begin with #cloud-config or a shebang.",
        );
    }

    return problems;
};

/** Every key the typed forms own, so the raw editor can exclude them. */
export const TYPED_KEYS: ReadonlySet<string> = new Set(
    FIELD_GROUPS.flatMap((group) => group.fields.map((field) => field.key)),
);
