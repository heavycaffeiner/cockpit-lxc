import { T, type ConfigSchema, type OptionSpec } from "../backend";

/**
 * The configuration surface.
 *
 * Two halves. The curated groups below are the settings an operator reaches for
 * often enough that a translated label, a placeholder and a validator beat
 * Incus's own one-line description; they are filtered against the server's
 * option table so a key this host does not have is never offered. Everything
 * else the server advertises is generated from that same table, which is what
 * makes "every setting is editable" true of the 75 options Incus 6.23 carries
 * for containers rather than of the 25 someone remembered to type out.
 *
 * Built by functions rather than declared as constants, because the strings have
 * to be translated after Cockpit's catalogue has loaded. A module-scope constant
 * would capture the untranslated text at import time.
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
    /**
     * What the server says about this option, when it says anything. Carries the
     * default and whether a restart is needed, neither of which the curated text
     * can state without going stale on the next Incus release.
     */
    spec?: OptionSpec;
}

export interface FieldGroup {
    id: string;
    title: string;
    description: string;
    fields: readonly FieldSpec[];
    /** Generated groups arrive collapsed; there are far more of them. */
    collapsed?: boolean;
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

const curatedFieldGroups = (): readonly FieldGroup[] => [
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

/**
 * The curated groups, filtered by what the server actually has.
 *
 * A field naming a key the schema does not carry is dropped rather than
 * rendered. Offering it produces a save that fails as a whole, because the
 * configuration PUT sends the entire editable half of the instance, and an error
 * that names the key but not the field it came from: Incus 6.23 answers
 * `limits.network.priority` with "Unknown configuration key", and a value in
 * that one field used to take every unrelated change in the same edit down with
 * it.
 *
 * With no schema every group is returned unchanged, which is the behaviour on a
 * server too old to describe itself.
 */
export const curatedGroups = (schema: ConfigSchema | null): readonly FieldGroup[] => {
    const groups = curatedFieldGroups();
    if (schema === null)
        return groups;

    return groups
        .map((group) => ({
            ...group,
            fields: group.fields
                .filter((field) => schema.byKey.has(field.key))
                .map((field) => {
                    const spec = schema.byKey.get(field.key);
                    return spec === undefined ? field : { ...field, spec };
                }),
        }))
        .filter((group) => group.fields.length > 0);
};

/**
 * Incus's group names, as headings.
 *
 * Only the nine a current server ships are translated. A group this does not
 * know is rendered under the name the server gave it, which is worse than a
 * translation and much better than being dropped.
 */
const groupTitle = (name: string): string => {
    switch (name) {
        case "boot": return T.fields.group_boot;
        case "cloud-init": return T.fields.group_cloud_init;
        case "migration": return T.fields.group_migration;
        case "miscellaneous": return T.fields.group_miscellaneous;
        case "nvidia": return T.fields.group_nvidia;
        case "raw": return T.fields.group_raw;
        case "resource-limits": return T.fields.group_resource_limits;
        case "security": return T.fields.group_security;
        case "snapshots": return T.fields.group_snapshots;
        default: return name;
    }
};

const kindFor = (spec: OptionSpec): FieldKind => {
    switch (spec.type) {
        case "bool":
            return "select";
        case "integer":
            return "number";
        case "blob":
            return "textarea";
        default:
            return "text";
    }
};

/**
 * Everything the server advertises that no curated group already owns.
 *
 * Grouped as Incus groups it and headed with Incus's own group name, so an
 * operator reading the upstream option reference finds the same divisions here.
 * The help text is the server's own `shortdesc`: it arrives in English and is
 * shown as it arrives, because translating 75 upstream descriptions would put
 * this plugin in the business of maintaining a fork of Incus's documentation.
 */
export const generatedGroups = (schema: ConfigSchema | null): readonly FieldGroup[] => {
    if (schema === null)
        return [];

    const groups: FieldGroup[] = [];

    for (const group of schema.groups) {
        const fields = group.options
            .filter((option) => !TYPED_KEYS.has(option.key))
            .map((option): FieldSpec => ({
                key: option.key,
                // The key is the label. Incus's descriptions are sentences about
                // the option rather than names for it, and inventing a name per
                // option would be inventing 75 pieces of terminology that no
                // upstream document uses.
                label: option.key,
                kind: kindFor(option),
                help: option.description,
                ...(option.type === "bool" ? { options: booleanOptions() } : {}),
                spec: option,
            }));

        if (fields.length > 0) {
            groups.push({
                id: `incus-${group.name}`,
                title: groupTitle(group.name),
                description: "",
                fields,
                collapsed: true,
            });
        }
    }

    return groups;
};

/**
 * The saved keys that only take effect at the next start.
 *
 * Empty for a container that is not running, which applies everything at its
 * next start anyway, and empty without a schema, since nothing then knows which
 * keys are live. Derived from what was saved rather than stored, so it cannot go
 * stale: the plugin has no way to learn that a restart happened outside it, and
 * a pending badge that is wrong is worse than none.
 */
export const restartPending = (
    schema: ConfigSchema | null,
    savedKeys: readonly string[],
    running: boolean,
): readonly string[] => {
    if (schema === null || !running)
        return [];
    return savedKeys
        .filter((key) => schema.byKey.get(key)?.liveUpdate === false)
        .sort();
};

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
    /*
     * No limits.network.priority. Incus 6.23 does not have it and answers a
     * write with "Unknown configuration key"; a server old enough to accept it
     * can still be given it through the raw editor, which is where a key with
     * no documentation belongs. Listing it here would hide it from that editor
     * as well, leaving a container that has it set with nowhere to see it.
     */
    "limits.processes", "limits.disk.priority",
    "security.privileged", "security.nesting", "security.protection.delete",
    "security.idmap.isolated", "security.syscalls.intercept.mknod",
    "boot.autostart", "boot.autostart.priority", "boot.autostart.delay",
    "boot.host_shutdown_timeout",
    "snapshots.schedule", "snapshots.schedule.stopped", "snapshots.pattern",
    "snapshots.expiry",
    "cloud-init.user-data", "cloud-init.network-config", "cloud-init.vendor-data",
]);
