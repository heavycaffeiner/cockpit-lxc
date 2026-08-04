import {
    Content,
    Page,
    PageSection,
    Spinner,
    Bullseye,
} from "@patternfly/react-core";
import { useEffect } from "react";

import { reloadOnSuperuserChange } from "./backend";
import { GridOverlay } from "./grid-overlay";
import { useContainers } from "./hooks/use-containers";
import { ContainerList } from "./views/container-list";
import { StartupFailure } from "./views/startup-states";

/**
 * Phase 2 shell: the startup sequence and the read-only container list.
 *
 * Everything the page can show is one of three things: still probing, a specific
 * failure the operator can act on, or the list. Nothing here talks to Incus
 * directly; the hook owns the driver and the driver owns Cockpit.
 */
export const Application = () => {
    const state = useContainers();

    /*
     * Escalating administrative access has to re-run the startup sequence, and
     * Cockpit already knows when that happens. Without this the operator would
     * grant access and keep looking at the same screen.
     */
    useEffect(() => reloadOnSuperuserChange(), []);

    return (
        <Page className="lxc-page">
            <PageSection>
                <Content component="h1" className="lxc-page__title">
                    LXC containers
                </Content>
            </PageSection>

            <PageSection>
                {state.status === "loading" && (
                    <Bullseye className="lxc-loading">
                        <Spinner aria-label="Contacting Incus" />
                    </Bullseye>
                )}

                {state.status === "failed" && (
                    <StartupFailure
                        kind={state.kind}
                        message={state.message}
                        onRetry={state.reload}
                    />
                )}

                {state.status === "ready" && (
                    <ContainerList
                        containers={state.containers}
                        onRefresh={state.reload}
                    />
                )}
            </PageSection>

            <GridOverlay />
        </Page>
    );
};
