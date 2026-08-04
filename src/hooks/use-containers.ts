import { useCallback, useEffect, useMemo, useState } from "react";

import {
    DriverError,
    IncusDriver,
    watchAdmin,
    type Container,
    type ContainerDriver,
    type DriverErrorKind,
    type ServerInfo,
} from "../backend";

export type LoadState =
    | { status: "loading" }
    | { status: "ready"; info: ServerInfo; containers: Container[] }
    | { status: "failed"; kind: DriverErrorKind | "unknown"; message: string };

export interface ContainersApi {
    state: LoadState;
    /** True while live updates are not working and the list may be stale. */
    degraded: boolean;
    reload: () => void;
    driver: ContainerDriver;
}

/**
 * Bursts of lifecycle events are coalesced over this window.
 *
 * Starting one container emits several events in quick succession, and each
 * would otherwise cost a full list refetch. Trailing rather than leading, so the
 * refetch sees the settled state instead of a state halfway through the change.
 */
const REFRESH_DEBOUNCE_MS = 500;

/**
 * Runs the startup sequence, loads the container list, and keeps it current.
 *
 * Probing and listing are one hook because they are one sequence: probing first
 * is what turns "the list failed to load" into a specific, actionable reason,
 * and listing before probing would surface a raw transport error where "Incus is
 * not installed" belongs.
 */
export const useContainers = (): ContainersApi => {
    const driver = useMemo(() => new IncusDriver(), []);
    const [state, setState] = useState<LoadState>({ status: "loading" });
    const [degraded, setDegraded] = useState(false);
    const [generation, setGeneration] = useState(0);

    /*
     * Stable across renders, which is what lets the subscriptions below depend
     * on it without being torn down and rebuilt on every render. The functional
     * update is what makes the empty dependency list correct.
     */
    const reload = useCallback(() => setGeneration((n) => n + 1), []);

    useEffect(() => {
        let cancelled = false;

        const run = async () => {
            try {
                const info = await driver.probe();
                const containers = await driver.listContainers();
                if (!cancelled)
                    setState({ status: "ready", info, containers });
            } catch (error) {
                if (cancelled)
                    return;

                if (error instanceof DriverError) {
                    setState({ status: "failed", kind: error.kind, message: error.message });
                    return;
                }

                setState({
                    status: "failed",
                    kind: "unknown",
                    message: error instanceof Error ? error.message : String(error),
                });
            }
        };

        void run();

        return () => {
            cancelled = true;
        };
    }, [driver, generation]);

    /*
     * Re-run when administrative access changes.
     *
     * The startup sequence branches on whether the session can reach the Incus
     * socket, so granting access has to repeat it. Reloading the data in place
     * rather than the page keeps the operator's filters and scroll position.
     */
    useEffect(() => {
        const watch = watchAdmin(reload);
        return () => watch.close();
    }, [reload]);

    /* Live updates. */
    useEffect(() => {
        let timer: ReturnType<typeof setTimeout> | null = null;

        const unsubscribe = driver.subscribeEvents({
            onLifecycle: () => {
                if (timer !== null)
                    clearTimeout(timer);
                timer = setTimeout(reload, REFRESH_DEBOUNCE_MS);
            },
            onDegraded: setDegraded,
        });

        return () => {
            if (timer !== null)
                clearTimeout(timer);
            unsubscribe();
        };
    }, [driver, reload]);

    // The driver owns a Cockpit HTTP client, which holds channels open. Closing
    // it on unmount keeps a navigation away from leaking them.
    useEffect(() => () => driver.close(), [driver]);

    return { state, degraded, reload, driver };
};
