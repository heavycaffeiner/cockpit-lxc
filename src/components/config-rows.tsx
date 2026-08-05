import { Button, TextInput, Tooltip } from "@patternfly/react-core";
import { MinusCircleIcon, PlusCircleIcon } from "@patternfly/react-icons";
import { useMemo, useState } from "react";

import { T, format } from "../backend";

interface Row {
    id: number;
    key: string;
    value: string;
}

interface ConfigRowsProps {
    /** The map as the server currently holds it. Read once, on mount. */
    config: Record<string, string>;
    /** Reports the whole map on every edit, so the caller holds one value. */
    onChange: (config: Record<string, string>) => void;
    /** Labels the inputs, so two editors on one page stay distinguishable. */
    label: string;
}

/**
 * Free-form key/value editing over a resource's config map.
 *
 * Profiles, networks and storage pools each take an open-ended config map whose
 * valid keys depend on the driver or network type in use. Enumerating them here
 * would mean shipping a copy of Incus's option table and falling behind it, so
 * the keys are typed rather than picked, the same trade the instance raw editor
 * makes.
 */
export const ConfigRows = ({ config, onChange, label }: ConfigRowsProps) => {
    const initial = useMemo(() => {
        let id = 0;
        return Object.entries(config)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, value]): Row => ({ id: id++, key, value }));
    }, [config]);

    const [rows, setRows] = useState<Row[]>(initial);
    const [nextId, setNextId] = useState(initial.length);

    const update = (next: Row[]) => {
        setRows(next);
        const map: Record<string, string> = {};
        for (const row of next) {
            const key = row.key.trim();
            if (key !== "")
                map[key] = row.value;
        }
        onChange(map);
    };

    const duplicates = useMemo(() => {
        const seen = new Map<string, number>();
        for (const row of rows) {
            const key = row.key.trim();
            if (key !== "")
                seen.set(key, (seen.get(key) ?? 0) + 1);
        }
        return new Set([...seen.entries()].filter(([, n]) => n > 1).map(([key]) => key));
    }, [rows]);

    return (
        <div className="lxc-raw">
            <table className="lxc-raw__table">
                <thead>
                    <tr>
                        <th scope="col">{T.config.key}</th>
                        <th scope="col">{T.environment.value}</th>
                        <th scope="col">
                            <span className="pf-v6-screen-reader">{T.environment.remove}</span>
                        </th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row, index) => {
                        const trimmed = row.key.trim();
                        const duplicate = trimmed !== "" && duplicates.has(trimmed);
                        return (
                            <tr key={row.id}>
                                <td>
                                    <TextInput
                                        value={row.key}
                                        aria-label={format(T.resources.key_of, index + 1, label)}
                                        validated={duplicate ? "error" : "default"}
                                        onChange={(_event, value) =>
                                            update(rows.map((r) =>
                                                r.id === row.id ? { ...r, key: value } : r))}
                                    />
                                </td>
                                <td>
                                    <TextInput
                                        value={row.value}
                                        aria-label={format(
                                            T.environment.value_for,
                                            trimmed || format(T.raw_config.key, index + 1),
                                        )}
                                        onChange={(_event, value) =>
                                            update(rows.map((r) =>
                                                r.id === row.id ? { ...r, value } : r))}
                                    />
                                </td>
                                <td>
                                    <Tooltip content={format(T.devices.remove, trimmed || T.raw_config.this_key)}>
                                        <Button
                                            variant="plain"
                                            icon={<MinusCircleIcon />}
                                            aria-label={format(
                                                T.devices.remove,
                                                trimmed || format(T.raw_config.key, index + 1),
                                            )}
                                            onClick={() => update(rows.filter((r) => r.id !== row.id))}
                                        />
                                    </Tooltip>
                                </td>
                            </tr>
                        );
                    })}
                    {rows.length === 0 && (
                        <tr>
                            <td colSpan={3}>
                                <span className="lxc-muted">{T.resources.nothing_is_set_here_yet}</span>
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>

            {duplicates.size > 0 && (
                <p className="lxc-raw__problem">
                    {format(T.raw_config.duplicate_keys_only_the_last_would, [...duplicates].join(", "))}
                </p>
            )}

            <Button
                variant="link"
                icon={<PlusCircleIcon />}
                onClick={() => {
                    setNextId(nextId + 1);
                    update([...rows, { id: nextId, key: "", value: "" }]);
                }}
            >
                {T.raw_config.add_key}
            </Button>
        </div>
    );
};
