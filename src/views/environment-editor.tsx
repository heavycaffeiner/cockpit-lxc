import { Button, TextInput, Tooltip } from "@patternfly/react-core";
import { MinusCircleIcon, PlusCircleIcon } from "@patternfly/react-icons";
import { useMemo, useState } from "react";

import { T, format } from "../backend";

/**
 * Incus stores environment variables as config keys under this prefix. The UI
 * shows the bare variable name, because `environment.PATH` is an implementation
 * detail of how they are persisted.
 */
const PREFIX = "environment.";

interface EnvRow {
    id: number;
    name: string;
    value: string;
}

interface EnvironmentEditorProps {
    localConfig: Record<string, string>;
    onChange: (edits: Record<string, string> | null) => void;
}

export const EnvironmentEditor = ({ localConfig, onChange }: EnvironmentEditorProps) => {
    const initial = useMemo(() => {
        let id = 0;
        return Object.entries(localConfig)
            .filter(([key]) => key.startsWith(PREFIX))
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, value]): EnvRow => ({
                id: id++,
                name: key.slice(PREFIX.length),
                value,
            }));
    }, [localConfig]);

    const [rows, setRows] = useState<EnvRow[]>(initial);
    const [nextId, setNextId] = useState(initial.length);

    const publish = (next: EnvRow[]) => {
        const changed =
            next.length !== initial.length ||
            next.some((row, index) => {
                const before = initial[index];
                return before === undefined ||
                    before.name !== row.name ||
                    before.value !== row.value;
            });

        if (!changed) {
            onChange(null);
            return;
        }

        const edits: Record<string, string> = {};
        // Removals have to be explicit, because the caller merges this over the
        // existing config rather than replacing it.
        for (const row of initial) {
            if (!next.some((candidate) => candidate.name === row.name))
                edits[PREFIX + row.name] = "";
        }
        for (const row of next) {
            const name = row.name.trim();
            if (name !== "")
                edits[PREFIX + name] = row.value;
        }
        onChange(edits);
    };

    const update = (next: EnvRow[]) => {
        setRows(next);
        publish(next);
    };

    /*
     * POSIX allows letters, digits and underscore, not starting with a digit.
     * Incus would accept more, but a variable most shells cannot reference is
     * not something to help an operator create by accident.
     */
    const invalid = (name: string): boolean =>
        name.trim() !== "" && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name.trim());

    return (
        <div className="lxc-raw">
            <table className="lxc-raw__table" aria-label={T.config.environment}>
                <thead>
                    <tr>
                        <th scope="col">{T.environment.variable}</th>
                        <th scope="col">{T.environment.value}</th>
                        <th scope="col"><span className="pf-v6-screen-reader">{T.environment.remove}</span></th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row, index) => (
                        <tr key={row.id}>
                            <td>
                                <TextInput
                                    value={row.name}
                                    aria-label={format(T.environment.environment_variable, index + 1)}
                                    validated={invalid(row.name) ? "error" : "default"}
                                    onChange={(_event, value) =>
                                        update(rows.map((r) =>
                                            r.id === row.id ? { ...r, name: value } : r))}
                                />
                            </td>
                            <td>
                                <TextInput
                                    value={row.value}
                                    aria-label={format(T.environment.value_for, row.name.trim() || format(T.environment.variable_2, index + 1))}
                                    onChange={(_event, value) =>
                                        update(rows.map((r) =>
                                            r.id === row.id ? { ...r, value } : r))}
                                />
                            </td>
                            <td>
                                <Tooltip content={format(T.devices.remove, row.name.trim() || T.environment.this_variable)}>
                                    <Button
                                        variant="plain"
                                        icon={<MinusCircleIcon />}
                                        aria-label={format(T.devices.remove, row.name.trim() || format(T.environment.variable_2, index + 1))}
                                        onClick={() => update(rows.filter((r) => r.id !== row.id))}
                                    />
                                </Tooltip>
                            </td>
                        </tr>
                    ))}
                    {rows.length === 0 && (
                        <tr>
                            <td colSpan={3}>
                                <span className="lxc-muted">
                                    {T.environment.no_environment_variables_are_set_on}
                                </span>
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>

            {rows.some((row) => invalid(row.name)) && (
                <p className="lxc-raw__problem">
                    {T.environment.a_variable_name_must_start_with}
                </p>
            )}

            <Button
                variant="link"
                icon={<PlusCircleIcon />}
                onClick={() => {
                    const next = [...rows, { id: nextId, name: "", value: "" }];
                    setNextId(nextId + 1);
                    update(next);
                }}
            >
                {T.environment.add_variable}
            </Button>
        </div>
    );
};
