import {
    Alert,
    Bullseye,
    Content,
    Page,
    PageSection,
    Spinner,
    Tab,
    TabTitleText,
    Tabs,
} from "@patternfly/react-core";
import { useState } from "react";

import { T } from "./backend";
import { LiveRegion } from "./components/live-region";
import { GridOverlay } from "./grid-overlay";
import { useContainers } from "./hooks/use-containers";
import { usePrefs } from "./prefs";
import { ContainerDetail } from "./views/container-detail";
import { ContainerList } from "./views/container-list";
import { ImagesView } from "./views/images-view";
import { NetworksView } from "./views/networks-view";
import { ProfilesView } from "./views/profiles-view";
import { StartupFailure } from "./views/startup-states";
import { StorageView } from "./views/storage-view";

/**
 * The top-level pages.
 *
 * Profiles, networks and storage pools sit beside containers rather than inside
 * an "other resources" drawer: a container's configuration refers to all three,
 * so reaching them should not mean knowing which tab hid them.
 */
type PageName = "containers" | "images" | "profiles" | "networks" | "storage";

const PAGES: readonly PageName[] = ["containers", "images", "profiles", "networks", "storage"];

const isPage = (value: string): value is PageName =>
    (PAGES as readonly string[]).includes(value);

/**
 * The shell: startup, the pages, live updates and the detail view.
 *
 * Selection is component state rather than a URL. Deep links and browser history
 * are worth having and are not free: Cockpit routes plugin pages through its own
 * location machinery, and wiring that in belongs with the rest of the detail
 * tabs rather than ahead of them.
 */
export const Application = () => {
    const { state, degraded, reload, generation, driver } = useContainers();
    const [prefs, setPrefs] = usePrefs();
    const [selected, setSelected] = useState<string | null>(null);

    const page: PageName = isPage(prefs.page) ? prefs.page : "containers";

    const containers = state.status === "ready" ? state.containers : [];
    // Re-resolved from the list on every render, so a rename or a state change
    // arriving over the event stream is reflected here without extra plumbing.
    const current = containers.find((container) => container.name === selected) ?? null;

    // The selected container can vanish: another session may delete it, and a
    // rename lands as a delete plus a create. Falling back to the list beats
    // showing a detail view for something that no longer exists.
    if (selected !== null && current === null && state.status === "ready")
        setSelected(null);

    const pageTitle: Record<PageName, string> = {
        containers: T.app.containers,
        images: T.common.images,
        profiles: T.common.profiles,
        networks: T.common.networks,
        storage: T.common.storage_pools,
    };

    /*
     * `sidebar={null}` is not the same as leaving the prop off.
     *
     * PatternFly tests it with `sidebar === null` to decide whether to add
     * `pf-m-no-sidebar`, so an absent prop is `undefined` and fails that test.
     * Without the class the page grid still reserves its sidebar column above
     * 1200px and the content is pushed into what is left, leaving a wide empty
     * gutter down the near side.
     *
     * `isContentFilled` stretches the main container to the full height of that
     * grid instead of letting it stop at its content, so the page scrolls inside
     * the frame the way Cockpit's own pages do.
     */
    return (
        <Page className="lxc-page" sidebar={null} isContentFilled>
            <PageSection>
                <Content component="h1" className="lxc-page__title">
                    {T.app.lxc_containers}
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
                        title={T.app.live_updates_unavailable_the_list_refreshes}
                        className="lxc-degraded"
                    />
                )}

                {state.status === "loading" && (
                    <Bullseye className="lxc-loading">
                        <Spinner aria-label={T.app.contacting_incus} />
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
                        schema={state.schema}
                        profiles={state.profiles}
                        driver={driver}
                        generation={generation}
                        initialTab={prefs.detailTab}
                        terminalFontSize={prefs.terminalFontSize}
                        onTabChange={(detailTab) => setPrefs({ detailTab })}
                        onFontSizeChange={(terminalFontSize) => setPrefs({ terminalFontSize })}
                        onBack={() => setSelected(null)}
                        onRefresh={reload}
                    />
                )}

                {state.status === "ready" && current === null && (
                    <Tabs
                        activeKey={page}
                        onSelect={(_event, key) => setPrefs({ page: String(key) })}
                        aria-label={T.app.lxc_views}
                        role="region"
                    >
                        {PAGES.map((name) => (
                            <Tab
                                key={name}
                                eventKey={name}
                                title={<TabTitleText>{pageTitle[name]}</TabTitleText>}
                            >
                                {/*
                                  * Only the open page is mounted. Each of the
                                  * others fetches on mount, and mounting all
                                  * five would issue five requests to show one.
                                  */}
                                {page === name && name === "containers" && (
                                    <ContainerList
                                        containers={state.containers}
                                        driver={driver}
                                        prefs={prefs}
                                        onPrefsChange={setPrefs}
                                        onRefresh={reload}
                                        onOpen={setSelected}
                                        onBrowseImages={() => setPrefs({ page: "images" })}
                                    />
                                )}
                                {page === name && name === "images" && (
                                    <ImagesView driver={driver} onChanged={reload} />
                                )}
                                {page === name && name === "profiles" && (
                                    <ProfilesView driver={driver} onChanged={reload} />
                                )}
                                {page === name && name === "networks" && (
                                    <NetworksView driver={driver} onChanged={reload} />
                                )}
                                {page === name && name === "storage" && (
                                    <StorageView driver={driver} onChanged={reload} />
                                )}
                            </Tab>
                        ))}
                    </Tabs>
                )}
            </PageSection>

            <LiveRegion />
            <GridOverlay />
        </Page>
    );
};
