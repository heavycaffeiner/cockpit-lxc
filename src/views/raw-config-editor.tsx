import {
    Button,
    TextInput,
    Tooltip,
} from "@patternfly/react-core";
import { MinusCircleIcon, PlusCircleIcon } from "@patternfly/react-icons";
import { useMemo, useState } from "react";

interface RawRow {
    id: number;
    key: string;
    value: string;
    /** Set on rows that came from the server, so a rename can remove the old key. */
    originalKey: string | null;
}

interface RawConfigEditorProps {
    localConfig: Record<string, string>;
    excluded: ReadonlySet<string>;
    onChange: (edits: Record<string, string> | null) => void;
}

/**
 * Free-form key/value editing over the instance-local config.
 *
 * This is the escape hatch that makes "every setting is editable" true rather
 * than approximately true: Incus keeps adding keys, and a UI that only knows the
 * ones it was built with would quietly fall behind. `raw.lxc` lives here too,
 * which is what keeps the full lxc.container.conf surface reachable.
 *
 * volatile.* is deliberately hidden. Incus owns those keys, rejects a body that
 * drops them, and showing them invites an edit that cannot succeed.
 */
export const RawConfigEditor = ({ localConfig, excluded, onChange }: RawConfigEditorProps) => {
    const initial = useMemo(() => {
        let id = 0;
        return Object.entries(localConfig)
            .filter(([key]) => !excluded.has(key) && !key.startsWith("volatile."))
            .filter(([key]) => !key.startsWith("image."))
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, value]): RawRow => ({ id: id++, key, value, originalKey: key }));
    }, [localConfig, excluded]);

    /*
     * Seeded once. When the container's own config changes underneath, for
     * example after a save, the parent remounts this with a new `key` rather
     * than having an effect reset the rows: resetting state by remounting is
     * React's documented pattern, and doing it in an effect costs an extra
     * render pass and loses nothing in exchange.
     */
    const [rows, setRows] = useState<RawRow[]>(initial);
    const [nextId, setNextId] = useState(initial.length);

    const publish = (next: RawRow[]) => {
        const changed =
            next.length !== initial.length ||
            next.some((row, index) => {
                const before = initial[index];
                return before === undefined ||
                    before.key !== row.key ||
                    before.value !== row.value;
            });

        if (!changed) {
            onChange(null);
            return;
        }

        const edits: Record<string, string> = {};
        // Keys removed or renamed have to be explicitly cleared, because the
        // caller merges this over the existing config.
        for (const row of initial) {
            if (!next.some((candidate) => candidate.key === row.key))
                edits[row.key] = "";
        }
        for (const row of next) {
            if (row.key.trim() !== "")
                edits[row.key.trim()] = row.value;
        }
        onChange(edits);
    };

    const update = (next: RawRow[]) => {
        setRows(next);
        publish(next);
    };

    const duplicateKeys = useMemo(() => {
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
                        <th scope="col">Key</th>
                        <th scope="col">Value</th>
                        <th scope="col"><span className="pf-v6-screen-reader">Remove</span></th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row, index) => {
                        const trimmed = row.key.trim();
                        const duplicate = trimmed !== "" && duplicateKeys.has(trimmed);
                        return (
                            <tr key={row.id}>
                                <td>
                                    <TextInput
                                        value={row.key}
                                        aria-label={`Configuration key ${index + 1}`}
                                        validated={duplicate ? "error" : "default"}
                                        onChange={(_event, value) =>
                                            update(rows.map((r) =>
                                                r.id === row.id ? { ...r, key: value } : r))}
                                    />
                                </td>
                                <td>
                                    <TextInput
                                        value={row.value}
                                        aria-label={`Value for ${trimmed || `key ${index + 1}`}`}
                                        onChange={(_event, value) =>
                                            update(rows.map((r) =>
                                                r.id === row.id ? { ...r, value } : r))}
                                    />
                                </td>
                                <td>
                                    <Tooltip content={`Remove ${trimmed || "this key"}`}>
                                        <Button
                                            variant="plain"
                                            icon={<MinusCircleIcon />}
                                            aria-label={`Remove ${trimmed || `key ${index + 1}`}`}
                                            onClick={() =>
                                                update(rows.filter((r) => r.id !== row.id))}
                                        />
                                    </Tooltip>
                                </td>
                            </tr>
                        );
                    })}
                    {rows.length === 0 && (
                        <tr>
                            <td colSpan={3}>
                                <span className="lxc-muted">
                                    No other keys are set on this container.
                                </span>
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>

            {duplicateKeys.size > 0 && (
                <p className="lxc-raw__problem">
                    Duplicate keys: {[...duplicateKeys].join(", ")}. Only the last would be
                    saved.
                </p>
            )}

            <Button
                variant="link"
                icon={<PlusCircleIcon />}
                onClick={() => {
                    const next = [...rows, { id: nextId, key: "", value: "", originalKey: null }];
                    setNextId(nextId + 1);
                    update(next);
                }}
            >
                Add key
            </Button>
        </div>
    );
};
