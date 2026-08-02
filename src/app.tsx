import {
    EmptyState,
    EmptyStateBody,
    Page,
    PageSection,
} from "@patternfly/react-core";
import { CubesIcon } from "@patternfly/react-icons";

import { getHostName } from "./backend";
import { GridOverlay } from "./grid-overlay";

/**
 * Phase 1 shell.
 *
 * This renders the page chrome and nothing else. The container list arrives in
 * Phase 2, once IncusDriver can answer listContainers(). What matters here is
 * that the page is mounted inside PatternFly's Page primitives, so that every
 * later view inherits Cockpit's spacing and theme rather than reinventing it.
 */
export const Application = () => (
    <Page className="lxc-page">
        <PageSection>
            <EmptyState
                headingLevel="h1"
                icon={CubesIcon}
                titleText="LXC containers"
            >
                <EmptyStateBody>
                    The container list is not implemented yet. This build exists to
                    verify the package scaffolding, the PatternFly baseline and the
                    4px grid gate.
                    <br />
                    Connected to <strong>{getHostName()}</strong>.
                </EmptyStateBody>
            </EmptyState>
        </PageSection>
        <GridOverlay />
    </Page>
);
