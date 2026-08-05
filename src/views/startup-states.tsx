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
import {
    K,
    INCUS_SOCKET,
    _,
    format,
} from "../backend";

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
                    titleText={_(K.startup_states.incus_is_not_installed)}
                    status="info"
                >
                    <EmptyStateBody>
                        <p>
                            {format(
                                _(K.startup_states.no_incus_socket_was_found_at),
                                INCUS_SOCKET,
                            )}
                        </p>
                        <ClipboardCopy
                            isReadOnly
                            hoverTip={_(K.container_actions.copy)}
                            clickTip={_(K.startup_states.copied)}
                            variant="expansion"
                        >
                            sudo dnf install incus incus-tools &amp;&amp; sudo systemctl enable --now incus.socket
                        </ClipboardCopy>
                    </EmptyStateBody>
                    <EmptyStateFooter>
                        <EmptyStateActions>
                            <Button variant="primary" onClick={onRetry}>
                                {_(K.startup_states.check_again)}
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
                    titleText={_(K.startup_states.administrative_access_is_required)}
                    status="warning"
                >
                    {/*
                      * The access control is named by where it is, not by its
                      * label. Cockpit's shell is localized, so quoting the
                      * English string would send an operator looking for a
                      * button that does not exist under that name.
                      */}
                    <EmptyStateBody>
                        {_(K.startup_states.the_incus_socket_is_owned_by)}
                    </EmptyStateBody>
                    <EmptyStateFooter>
                        <EmptyStateActions>
                            <Button variant="primary" onClick={onRetry}>
                                {_(K.startup_states.try_again)}
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
                    titleText={_(K.startup_states.incus_does_not_trust_this_connection)}
                    status="warning"
                >
                    <EmptyStateBody>
                        {_(K.startup_states.incus_answered_but_reported_the_connection)}
                    </EmptyStateBody>
                    <EmptyStateFooter>
                        <EmptyStateActions>
                            <Button variant="primary" onClick={onRetry}>
                                {_(K.startup_states.try_again)}
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
                        ? _(K.startup_states.cannot_reach_incus)
                        : _(K.startup_states.incus_returned_something_unexpected)}
                    status="danger"
                >
                    <EmptyStateBody>{message}</EmptyStateBody>
                    <EmptyStateFooter>
                        <EmptyStateActions>
                            <Button variant="primary" onClick={onRetry}>
                                {_(K.startup_states.try_again)}
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
    <EmptyState headingLevel="h1" icon={CubesIcon} titleText={_(K.startup_states.no_containers_yet)}>
        <EmptyStateBody>
            {_(K.startup_states.this_host_runs_incus_but_has)}
        </EmptyStateBody>
        <EmptyStateFooter>
            <EmptyStateActions>
                <Button variant="primary" onClick={onCreate}>
                    {_(K.container_list.create_container)}
                </Button>
                <Button variant="link" onClick={onRefresh}>
                    {_(K.container_list.refresh)}
                </Button>
            </EmptyStateActions>
        </EmptyStateFooter>
    </EmptyState>
);
