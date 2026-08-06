import { useCallback, useEffect, useMemo, useState } from "react";

import {
    DriverError,
    IncusDriver,
    watchAdmin,
    type ConfigSchema,
    type Container,
    type ContainerDriver,
    type DriverErrorKind,
    type Profile,
    type ServerInfo,
} from "../backend";

export type LoadState =
    | { status: "loading" }
    | {
        status: "ready";
        info: ServerInfo;
        /** Incus's own option table, or null when the server does not offer one. */
        schema: ConfigSchema | null;
        containers: Container[];
        profiles: Profile[];
    }
    | { status: "failed"; kind: DriverErrorKind | "unknown"; message: string };

export interface ContainersApi {
    state: LoadState;
    /** True while live updates are not working and the list may be stale. */
    degraded: boolean;
    reload: () => void;
    /** Increments on every reload, so detail views know to refetch. */
    generation: number;
    driver: ContainerDriver;
}

/**
 * Bursts of lifecycle events are coalesced over this window.
 *
 * Starting one container emits several events in quick succession, and each
 * would otherwise cost a full list refetch. Trailing rather than leading, so the
 * refetch sees the settled state instead of one halfway through the change.
 */
const REFRESH_DEBOUNCE_MS = 500;

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

                /*
                 * Profiles are supporting data: a failure there is not a reason
                 * to withhold the container list, which is the thing the
                 * operator came for. Metrics are not fetched at all, because
                 * listContainers already carries them.
                 */
                const profiles = await driver.listProfiles().catch(() => [] as Profile[]);

                /*
                 * The option table, which decides what the configuration forms
                 * may offer. Resolves to null rather than rejecting on a server
                 * that cannot describe itself, and the forms fall back to their
                 * curated list, so this is never on the failure path.
                 */
                const schema = await driver.fetchConfigSchema(info.extensions);

                if (!cancelled)
                    setState({ status: "ready", info, schema, containers, profiles });
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

    return { state, degraded, reload, generation, driver };
};
