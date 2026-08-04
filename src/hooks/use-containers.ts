import { useCallback, useEffect, useMemo, useState } from "react";

import {
    DriverError,
    IncusDriver,
    watchAdmin,
    type Container,
    type DriverErrorKind,
    type ServerInfo,
} from "../backend";

export type LoadState =
    | { status: "loading" }
    | { status: "ready"; info: ServerInfo; containers: Container[] }
    | { status: "failed"; kind: DriverErrorKind | "unknown"; message: string };

/**
 * Runs the startup sequence and loads the container list.
 *
 * The two are one hook rather than two because they are one sequence: probing
 * first is what turns "the list failed to load" into a specific, actionable
 * reason, and listing before probing would surface a raw transport error where
 * "Incus is not installed" belongs.
 */
export const useContainers = (): LoadState & { reload: () => void } => {
    const driver = useMemo(() => new IncusDriver(), []);
    const [state, setState] = useState<LoadState>({ status: "loading" });
    const [generation, setGeneration] = useState(0);

    const reload = useCallback(() => setGeneration((n) => n + 1), []);

    useEffect(() => {
        let cancelled = false;

        const run = async () => {
            setState({ status: "loading" });
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
     * socket, so granting access has to repeat it. Reloading in place rather
     * than reloading the page keeps the operator's scroll position and filters,
     * and avoids a full bundle re-parse for what is a data change.
     */
    useEffect(() => {
        const watch = watchAdmin(reload);
        return () => watch.close();
    }, [reload]);

    // The driver owns a Cockpit HTTP client, which holds channels open. Closing
    // it on unmount keeps a navigation away from leaking them.
    useEffect(() => () => driver.close(), [driver]);

    return { ...state, reload };
};
