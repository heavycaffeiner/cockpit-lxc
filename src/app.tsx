import {
    Alert,
    Bullseye,
    Content,
    Page,
    PageSection,
    Spinner,
} from "@patternfly/react-core";
import { useState } from "react";

import { GridOverlay } from "./grid-overlay";
import { useContainers } from "./hooks/use-containers";
import { ContainerDetail } from "./views/container-detail";
import { ContainerList } from "./views/container-list";
import { StartupFailure } from "./views/startup-states";

/**
 * Phase 4 shell: startup, the container list, live updates and the detail view.
 *
 * Selection is component state rather than a URL. Deep links and browser history
 * are worth having and are not free: Cockpit routes plugin pages through its own
 * location machinery, and wiring that in belongs with the rest of the detail
 * tabs rather than ahead of them.
 */
export const Application = () => {
    const { state, degraded, reload, generation, driver } = useContainers();
    const [selected, setSelected] = useState<string | null>(null);

    const containers = state.status === "ready" ? state.containers : [];
    // Re-resolved from the list on every render, so a rename or a state change
    // arriving over the event stream is reflected here without extra plumbing.
    const current = containers.find((container) => container.name === selected) ?? null;

    // The selected container can vanish: another session may delete it, and a
    // rename lands as a delete plus a create. Falling back to the list beats
    // showing a detail view for something that no longer exists.
    if (selected !== null && current === null && state.status === "ready")
        setSelected(null);

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

                {state.status === "ready" && current !== null && (
                    <ContainerDetail
                        container={current}
                        info={state.info}
                        profiles={state.profiles}
                        metrics={state.metrics.get(current.name)}
                        driver={driver}
                        generation={generation}
                        onBack={() => setSelected(null)}
                        onRefresh={reload}
                    />
                )}

                {state.status === "ready" && current === null && (
                    <ContainerList
                        containers={state.containers}
                        driver={driver}
                        onRefresh={reload}
                        onOpen={setSelected}
                    />
                )}
            </PageSection>

            <GridOverlay />
        </Page>
    );
};
