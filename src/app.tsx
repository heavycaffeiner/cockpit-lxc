import {
    Content,
    Page,
    PageSection,
    Spinner,
    Bullseye,
} from "@patternfly/react-core";
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
