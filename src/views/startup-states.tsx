import {
    Button,
    ClipboardCopy,
    EmptyState,
    EmptyStateActions,
    EmptyStateBody,
    EmptyStateFooter,
} from "@patternfly/react-core";
import {
    CubesIcon,
    ExclamationCircleIcon,
    LockIcon,
    PlugIcon,
} from "@patternfly/react-icons";

import type { DriverErrorKind } from "../backend";
import { INCUS_SOCKET } from "../backend";

interface StartupFailureProps {
    kind: DriverErrorKind | "unknown";
    message: string;
    onRetry: () => void;
}

/**
 * The startup failure states.
 *
 * Each kind gets its own screen because each needs something different from the
 * operator: install a package, grant administrative access, fix Incus's trust
 * configuration, or retry. Collapsing them into one "could not connect" error
 * would make the plugin useless precisely when something is wrong.
 */
export const StartupFailure = ({ kind, message, onRetry }: StartupFailureProps) => {
    switch (kind) {
        case "not-installed":
            return (
                <EmptyState
                    headingLevel="h1"
                    icon={CubesIcon}
                    titleText="Incus is not installed"
                    status="info"
                >
                    <EmptyStateBody>
                        <p>
                            No Incus socket was found at <code>{INCUS_SOCKET}</code>. Install
                            Incus and start its socket unit, then reload this page.
                        </p>
                        <ClipboardCopy
                            isReadOnly
                            hoverTip="Copy"
                            clickTip="Copied"
                            variant="expansion"
                        >
                            sudo dnf install incus incus-tools &amp;&amp; sudo systemctl enable --now incus.socket
                        </ClipboardCopy>
                    </EmptyStateBody>
                    <EmptyStateFooter>
                        <EmptyStateActions>
                            <Button variant="primary" onClick={onRetry}>
                                Check again
                            </Button>
                        </EmptyStateActions>
                    </EmptyStateFooter>
                </EmptyState>
            );

        case "access-denied":
            return (
                <EmptyState
                    headingLevel="h1"
                    icon={LockIcon}
                    titleText="Administrative access is required"
                    status="warning"
                >
                    <EmptyStateBody>
                        The Incus socket is owned by <code>root:incus-admin</code>, so reading
                        it needs administrative access. Select{" "}
                        <strong>Limited access</strong> in Cockpit&apos;s header and turn it on.
                        This page loads the containers by itself once you do.
                    </EmptyStateBody>
                    <EmptyStateFooter>
                        <EmptyStateActions>
                            <Button variant="primary" onClick={onRetry}>
                                Try again
                            </Button>
                        </EmptyStateActions>
                    </EmptyStateFooter>
                </EmptyState>
            );

        case "untrusted":
            return (
                <EmptyState
                    headingLevel="h1"
                    icon={LockIcon}
                    titleText="Incus does not trust this connection"
                    status="warning"
                >
                    <EmptyStateBody>
                        Incus answered but reported the connection as untrusted, so it will
                        not return any data. This is an Incus authorization setting rather
                        than a Cockpit one, and granting administrative access here will not
                        change it.
                    </EmptyStateBody>
                    <EmptyStateFooter>
                        <EmptyStateActions>
                            <Button variant="primary" onClick={onRetry}>
                                Try again
                            </Button>
                        </EmptyStateActions>
                    </EmptyStateFooter>
                </EmptyState>
            );

        case "transport":
        case "parse":
        case "unknown":
        default:
            return (
                <EmptyState
                    headingLevel="h1"
                    icon={kind === "transport" ? PlugIcon : ExclamationCircleIcon}
                    titleText={
                        kind === "transport"
                            ? "Cannot reach Incus"
                            : "Incus returned something unexpected"
                    }
                    status="danger"
                >
                    <EmptyStateBody>{message}</EmptyStateBody>
                    <EmptyStateFooter>
                        <EmptyStateActions>
                            <Button variant="primary" onClick={onRetry}>
                                Try again
                            </Button>
                        </EmptyStateActions>
                    </EmptyStateFooter>
                </EmptyState>
            );
    }
};

/** Shown when Incus is reachable and healthy but holds no system containers. */
export const NoContainers = ({ onRefresh }: { onRefresh: () => void }) => (
    <EmptyState headingLevel="h1" icon={CubesIcon} titleText="No containers yet">
        <EmptyStateBody>
            This host runs Incus but has no system containers. Creating them from here
            arrives in a later release; until then use <code>incus launch</code>.
        </EmptyStateBody>
        <EmptyStateFooter>
            <EmptyStateActions>
                <Button variant="secondary" onClick={onRefresh}>
                    Refresh
                </Button>
            </EmptyStateActions>
        </EmptyStateFooter>
    </EmptyState>
);
