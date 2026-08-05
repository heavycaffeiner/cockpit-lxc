import { T } from "../backend";

/**
 * The typed configuration surface.
 *
 * Incus exposes over 150 instance options. These are the ones an operator
 * reaches for often enough that a labelled field beats typing a key by hand;
 * everything else stays reachable through the raw editor, which is what keeps
 * the "every setting is editable" promise true as Incus adds keys.
 *
 * Built by a function rather than declared as a constant, because the strings
 * have to be translated after Cockpit's catalogue has loaded. A module-scope
 * constant would capture the untranslated text at import time.
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
    return T.fields.expected_a_size_such_as_512mib;
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
    return T.fields.expected_a_count_such_as_4;
};

const validatePositiveInteger = (value: string): string | null => {
    if (value === "")
        return null;
    return /^\d+$/.test(value.trim()) ? null : T.fields.expected_a_whole_number;
};

const validatePriority = (value: string): string | null => {
    if (value === "")
        return null;
    if (!/^\d+$/.test(value.trim()))
        return T.fields.expected_a_whole_number_between_0;
    const n = Number(value);
    return n >= 0 && n <= 10 ? null : T.fields.expected_a_whole_number_between_0;
};

const booleanOptions = () => [
    { value: "", label: T.fields.inherited },
    { value: "true", label: T.fields.enabled },
    { value: "false", label: T.fields.disabled },
];

export const fieldGroups = (): readonly FieldGroup[] => [
    {
        id: "resources",
        title: T.fields.resource_limits,
        description: T.fields.caps_enforced_through_cgroups_an_empty,
        fields: [
            {
                key: "limits.cpu",
                label: T.fields.cpu,
                kind: "text",
                placeholder: T.fields.example_4_or_0_3,
                help: T.fields.a_number_of_cores_or_the,
                validate: validateCpu,
            },
            {
                key: "limits.cpu.allowance",
                label: T.fields.cpu_allowance,
                kind: "text",
                placeholder: T.fields.example_50_or_25ms_100ms,
                help: T.fields.a_share_of_the_available_time,
            },
            {
                key: "limits.cpu.priority",
                label: T.fields.cpu_priority,
                kind: "number",
                placeholder: "0-10",
                help: T.fields.relative_weight_when_containers_compete_for,
                validate: validatePriority,
            },
            {
                key: "limits.memory",
                label: T.fields.memory,
                kind: "text",
                placeholder: "512MiB",
                help: T.fields.a_size_or_a_percentage_of,
                validate: validateMemory,
            },
            {
                key: "limits.memory.enforce",
                label: T.fields.memory_enforcement,
                kind: "select",
                help: T.fields.hard_kills_on_overcommit_soft_allows,
                options: [
                    { value: "", label: T.fields.inherited },
                    { value: "hard", label: T.fields.hard },
                    { value: "soft", label: T.fields.soft },
                ],
            },
            {
                key: "limits.memory.swap",
                label: T.fields.allow_swap,
                kind: "select",
                help: T.fields.whether_this_container_s_pages_may,
                options: booleanOptions(),
            },
            {
                key: "limits.processes",
                label: T.fields.process_limit,
                kind: "number",
                placeholder: "2000",
                help: T.fields.maximum_number_of_processes,
                validate: validatePositiveInteger,
            },
            {
                key: "limits.disk.priority",
                label: T.fields.disk_priority,
                kind: "number",
                placeholder: "0-10",
                help: T.fields.relative_i_o_weight_against_other,
                validate: validatePriority,
            },
            {
                key: "limits.network.priority",
                label: T.fields.network_priority,
                kind: "number",
                placeholder: "0-10",
                help: T.fields.relative_network_weight_against_other_containers,
                validate: validatePriority,
            },
        ],
    },
    {
        id: "security",
        title: T.fields.security,
        description: T.fields.a_privileged_container_s_root_maps,
        fields: [
            {
                key: "security.privileged",
                label: T.fields.privileged,
                kind: "select",
                help: T.fields.runs_without_a_uid_mapping_escaping,
                options: booleanOptions(),
            },
            {
                key: "security.nesting",
                label: T.fields.nesting,
                kind: "select",
                help: T.fields.allows_containers_inside_this_container,
                options: booleanOptions(),
            },
            {
                key: "security.protection.delete",
                label: T.fields.delete_protection,
                kind: "select",
                help: T.fields.refuses_deletion_while_set_including_from,
                options: booleanOptions(),
            },
            {
                key: "security.idmap.isolated",
                label: T.fields.isolated_id_map,
                kind: "select",
                help: T.fields.gives_this_container_a_uid_range,
                options: booleanOptions(),
            },
            {
                key: "security.syscalls.intercept.mknod",
                label: T.fields.intercept_mknod,
                kind: "select",
                help: T.fields.lets_the_container_create_device_nodes,
                options: booleanOptions(),
            },
        ],
    },
    {
        id: "boot",
        title: T.fields.startup_and_shutdown,
        description: T.fields.what_happens_to_this_container_when,
        fields: [
            {
                key: "boot.autostart",
                label: T.fields.start_on_boot,
                kind: "select",
                help: T.fields.starts_with_the_host_unset_follows,
                options: booleanOptions(),
            },
            {
                key: "boot.autostart.priority",
                label: T.fields.autostart_priority,
                kind: "number",
                placeholder: "0",
                help: T.fields.higher_starts_earlier,
                validate: validatePositiveInteger,
            },
            {
                key: "boot.autostart.delay",
                label: T.fields.autostart_delay,
                kind: "number",
                placeholder: "0",
                help: T.fields.seconds_to_wait_after_this_container,
                validate: validatePositiveInteger,
            },
            {
                key: "boot.host_shutdown_timeout",
                label: T.fields.shutdown_timeout,
                kind: "number",
                placeholder: "30",
                help: T.fields.seconds_to_wait_for_a_clean,
                validate: validatePositiveInteger,
            },
        ],
    },
    {
        id: "snapshots",
        title: T.fields.automatic_snapshots,
        description: T.fields.incus_can_take_snapshots_on_a,
        fields: [
            {
                key: "snapshots.schedule",
                label: T.fields.schedule,
                kind: "text",
                placeholder: T.fields.daily_or_0_6,
                help: T.fields.a_cron_expression_or_one_of,
                extension: "snapshot_scheduling",
            },
            {
                key: "snapshots.schedule.stopped",
                label: T.fields.snapshot_while_stopped,
                kind: "select",
                help: T.fields.whether_the_schedule_also_applies_when,
                options: booleanOptions(),
                extension: "snapshot_scheduling",
            },
            {
                key: "snapshots.pattern",
                label: T.fields.name_pattern,
                kind: "text",
                placeholder: "snap%d",
                help: T.fields.how_scheduled_snapshots_are_named_supports,
                extension: "snapshot_scheduling",
            },
            {
                key: "snapshots.expiry",
                label: T.fields.expiry,
                kind: "text",
                placeholder: "2w",
                help: T.fields.how_long_a_snapshot_is_kept,
                extension: "snapshot_scheduling",
                validate: (value) =>
                    value === "" || /^(\d+[SMHdwmy])+$/.test(value.trim())
                        ? null
                        : T.fields.expected_a_duration_such_as_6h,
            },
        ],
    },
    {
        id: "cloudinit",
        title: T.fields.cloud_init,
        description: T.fields.applied_on_first_boot_by_images,
        fields: [
            {
                key: "cloud-init.user-data",
                label: T.fields.user_data,
                kind: "textarea",
                help: T.fields.a_cloud_config_document_starting_with,
            },
            {
                key: "cloud-init.network-config",
                label: T.fields.network_config,
                kind: "textarea",
                help: T.fields.a_cloud_init_network_configuration_document,
            },
            {
                key: "cloud-init.vendor-data",
                label: T.fields.vendor_data,
                kind: "textarea",
                help: T.fields.vendor_data_merged_with_user_data,
            },
        ],
    },
];

/** Cross-field rules the API would reject, checked before a round trip. */
export const formLevelProblems = (config: Record<string, string>): string[] => {
    const problems: string[] = [];

    const swap = config["limits.memory.swap"];
    if ((swap === "true" || swap === "false") && !config["limits.memory"])
        problems.push(T.fields.a_swap_setting_has_no_effect);

    if (config["limits.memory.enforce"] && !config["limits.memory"])
        problems.push(T.fields.memory_enforcement_has_no_effect_without);

    if (config["security.privileged"] === "true" && config["security.idmap.isolated"] === "true")
        problems.push(T.fields.a_privileged_container_has_no_id);

    const userData = config["cloud-init.user-data"];
    if (userData !== undefined && userData.trim() !== "" &&
        !userData.trimStart().startsWith("#cloud-config") &&
        !userData.trimStart().startsWith("#!")) {
        problems.push(T.fields.cloud_init_user_data_usually_has);
    }

    return problems;
};

/**
 * Every key the typed forms own, so the raw editor can exclude them.
 *
 * Listed independently of the groups above, because the keys are not
 * translatable and deriving them would mean building the translated groups just
 * to read their key names.
 */
export const TYPED_KEYS: ReadonlySet<string> = new Set([
    "limits.cpu", "limits.cpu.allowance", "limits.cpu.priority",
    "limits.memory", "limits.memory.enforce", "limits.memory.swap",
    "limits.processes", "limits.disk.priority", "limits.network.priority",
    "security.privileged", "security.nesting", "security.protection.delete",
    "security.idmap.isolated", "security.syscalls.intercept.mknod",
    "boot.autostart", "boot.autostart.priority", "boot.autostart.delay",
    "boot.host_shutdown_timeout",
    "snapshots.schedule", "snapshots.schedule.stopped", "snapshots.pattern",
    "snapshots.expiry",
    "cloud-init.user-data", "cloud-init.network-config", "cloud-init.vendor-data",
]);
