import {
    Alert,
    Bullseye,
    Content,
    Page,
    PageSection,
    Spinner,
} from "@patternfly/react-core";

import { GridOverlay } from "./grid-overlay";
import { useContainers } from "./hooks/use-containers";
import { ContainerList } from "./views/container-list";
import { StartupFailure } from "./views/startup-states";

/**
 * Phase 3 shell: the startup sequence, the container list, and live updates.
 *
 * Everything the page can show is one of three things: still probing, a specific
 * failure the operator can act on, or the list. Nothing here talks to Incus
 * directly; the hook owns the driver and the driver owns Cockpit.
 */
export const Application = () => {
    const { state, degraded, reload, driver } = useContainers();

    return (
        <Page className="lxc-page">
            <PageSection>
                <Content component="h1" className="lxc-page__title">
                    LXC containers
                </Content>
            </PageSection>

            <PageSection>
                {/*
                  * A stale list that looks live is worse than one that admits it.
                  * This says so without taking the list away, because the data is
                  * still useful, just not guaranteed current.
                  */}
                {degraded && state.status === "ready" && (
                    <Alert
                        variant="warning"
                        isInline
                        isPlain
                        title="Live updates unavailable. The list refreshes only when you ask it to."
                        className="lxc-degraded"
                    />
                )}

                {state.status === "loading" && (
                    <Bullseye className="lxc-loading">
                        <Spinner aria-label="Contacting Incus" />
                    </Bullseye>
                )}

                {state.status === "failed" && (
                    <StartupFailure
                        kind={state.kind}
                        message={state.message}
                        onRetry={reload}
                    />
                )}

                {state.status === "ready" && (
                    <ContainerList
                        containers={state.containers}
                        driver={driver}
                        onRefresh={reload}
                    />
                )}
            </PageSection>

            <GridOverlay />
        </Page>
    );
};
