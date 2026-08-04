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
import { INCUS_SOCKET, _, format } from "../backend";

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
                    titleText={_("Incus is not installed")}
                    status="info"
                >
                    <EmptyStateBody>
                        <p>
                            {format(
                                _("No Incus socket was found at $0. Install Incus and start its socket unit, then reload this page."),
                                INCUS_SOCKET,
                            )}
                        </p>
                        <ClipboardCopy
                            isReadOnly
                            hoverTip={_("Copy")}
                            clickTip={_("Copied")}
                            variant="expansion"
                        >
                            sudo dnf install incus incus-tools &amp;&amp; sudo systemctl enable --now incus.socket
                        </ClipboardCopy>
                    </EmptyStateBody>
                    <EmptyStateFooter>
                        <EmptyStateActions>
                            <Button variant="primary" onClick={onRetry}>
                                {_("Check again")}
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
                    titleText={_("Administrative access is required")}
                    status="warning"
                >
                    {/*
                      * The access control is named by where it is, not by its
                      * label. Cockpit's shell is localized, so quoting the
                      * English string would send an operator looking for a
                      * button that does not exist under that name.
                      */}
                    <EmptyStateBody>
                        {_("The Incus socket is owned by root:incus-admin, so reading it needs administrative access. Turn it on from the access button in Cockpit's top bar. This page loads the containers by itself once you do.")}
                    </EmptyStateBody>
                    <EmptyStateFooter>
                        <EmptyStateActions>
                            <Button variant="primary" onClick={onRetry}>
                                {_("Try again")}
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
                    titleText={_("Incus does not trust this connection")}
                    status="warning"
                >
                    <EmptyStateBody>
                        {_("Incus answered but reported the connection as untrusted, so it will not return any data. This is an Incus authorization setting rather than a Cockpit one, and granting administrative access here will not change it.")}
                    </EmptyStateBody>
                    <EmptyStateFooter>
                        <EmptyStateActions>
                            <Button variant="primary" onClick={onRetry}>
                                {_("Try again")}
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
                    titleText={kind === "transport"
                        ? _("Cannot reach Incus")
                        : _("Incus returned something unexpected")}
                    status="danger"
                >
                    <EmptyStateBody>{message}</EmptyStateBody>
                    <EmptyStateFooter>
                        <EmptyStateActions>
                            <Button variant="primary" onClick={onRetry}>
                                {_("Try again")}
                            </Button>
                        </EmptyStateActions>
                    </EmptyStateFooter>
                </EmptyState>
            );
    }
};

/** Shown when Incus is reachable and healthy but holds no system containers. */
export const NoContainers = ({
    onRefresh,
    onCreate,
}: {
    onRefresh: () => void;
    onCreate: () => void;
}) => (
    <EmptyState headingLevel="h1" icon={CubesIcon} titleText={_("No containers yet")}>
        <EmptyStateBody>
            {_("This host runs Incus but has no system containers.")}
        </EmptyStateBody>
        <EmptyStateFooter>
            <EmptyStateActions>
                <Button variant="primary" onClick={onCreate}>
                    {_("Create container")}
                </Button>
                <Button variant="link" onClick={onRefresh}>
                    {_("Refresh")}
                </Button>
            </EmptyStateActions>
        </EmptyStateFooter>
    </EmptyState>
);
