import { useCallback, useEffect, useState } from "react";

const errorText = (error: unknown): string =>
    error instanceof Error ? error.message : String(error);

export interface ResourceList<Item> {
    /** Null until the first load settles, which is what distinguishes it from empty. */
    items: readonly Item[] | null;
    error: string | null;
    busy: boolean;
    reload: () => void;
    /** Run a mutation, then reload. Failures land in `error` rather than throwing. */
    run: (action: () => Promise<void>) => Promise<void>;
}

/**
 * Load a list of resources and mutate it.
 *
 * The four resource pages differ in their columns and their dialogs, not in how
 * they fetch, report a failure or refresh after a write, so that part lives
 * here instead of four times over.
 */
export const useResourceList = <Item>(load: () => Promise<Item[]>): ResourceList<Item> => {
    const [items, setItems] = useState<readonly Item[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const reload = useCallback(() => {
        load().then(
            (result) => { setItems(result); setError(null); },
            // An empty list rather than null, so the page renders its own empty
            // state under the error instead of spinning forever.
            (caught: unknown) => { setItems([]); setError(errorText(caught)); },
        );
    }, [load]);

    useEffect(reload, [reload]);

    const run = useCallback(async (action: () => Promise<void>) => {
        setBusy(true);
        setError(null);
        try {
            await action();
            reload();
        } catch (caught) {
            setError(errorText(caught));
            throw caught;
        } finally {
            setBusy(false);
        }
    }, [reload]);

    return { items, error, busy, reload, run };
};
