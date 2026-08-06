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
    INCUS_SOCKETS,
    T,
    format,
} from "../backend";

/**
 * How to install Incus, on each distribution this project ships a package for.
 *
 * Distribution names and shell commands, so nothing here is translated: a
 * translated `dnf` would not run.
 */
const INSTALL_COMMANDS: readonly { distribution: string; command: string }[] = [
    {
        distribution: "RHEL",
        command: "sudo dnf install incus incus-tools && sudo systemctl enable --now incus.socket",
    },
    {
        distribution: "Debian",
        command: "sudo apt install incus incus-client && sudo systemctl enable --now incus.socket",
    },
    {
        distribution: "Arch",
        command: "sudo pacman -S incus && sudo systemctl enable --now incus.socket",
    },
];

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
                    titleText={T.startup.incus_is_not_installed}
                    status="info"
                >
                    <EmptyStateBody>
                        <p>
                            {/*
                              * Both candidates are named. Distributions disagree
                              * about where the socket belongs, and a message
                              * naming only one invites the operator to go
                              * looking in the wrong place.
                              */}
                            {format(
                                T.startup.no_incus_socket_was_found_at,
                                INCUS_SOCKETS.join(" or "),
                            )}
                        </p>
                        {/*
                          * One command per supported distribution rather than
                          * the dnf one this used to assume, now that there are
                          * three of them.
                          */}
                        {INSTALL_COMMANDS.map(({ distribution, command }) => (
                            <ClipboardCopy
                                key={distribution}
                                isReadOnly
                                hoverTip={T.actions.copy}
                                clickTip={T.startup.copied}
                                variant="expansion"
                                className="lxc-startup__command"
                            >
                                {`# ${distribution}\n${command}`}
                            </ClipboardCopy>
                        ))}
                    </EmptyStateBody>
                    <EmptyStateFooter>
                        <EmptyStateActions>
                            <Button variant="primary" onClick={onRetry}>
                                {T.startup.check_again}
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
                    titleText={T.startup.administrative_access_is_required}
                    status="warning"
                >
                    {/*
                      * The access control is named by where it is, not by its
                      * label. Cockpit's shell is localized, so quoting the
                      * English string would send an operator looking for a
                      * button that does not exist under that name.
                      */}
                    <EmptyStateBody>
                        {T.startup.the_incus_socket_is_owned_by}
                    </EmptyStateBody>
                    <EmptyStateFooter>
                        <EmptyStateActions>
                            <Button variant="primary" onClick={onRetry}>
                                {T.startup.try_again}
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
                    titleText={T.startup.incus_does_not_trust_this_connection}
                    status="warning"
                >
                    <EmptyStateBody>
                        {T.startup.incus_answered_but_reported_the_connection}
                    </EmptyStateBody>
                    <EmptyStateFooter>
                        <EmptyStateActions>
                            <Button variant="primary" onClick={onRetry}>
                                {T.startup.try_again}
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
                        ? T.startup.cannot_reach_incus
                        : T.startup.incus_returned_something_unexpected}
                    status="danger"
                >
                    <EmptyStateBody>{message}</EmptyStateBody>
                    <EmptyStateFooter>
                        <EmptyStateActions>
                            <Button variant="primary" onClick={onRetry}>
                                {T.startup.try_again}
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
    <EmptyState headingLevel="h1" icon={CubesIcon} titleText={T.startup.no_containers_yet}>
        <EmptyStateBody>
            {T.startup.this_host_runs_incus_but_has}
        </EmptyStateBody>
        <EmptyStateFooter>
            <EmptyStateActions>
                <Button variant="primary" onClick={onCreate}>
                    {T.list.create_container}
                </Button>
                <Button variant="link" onClick={onRefresh}>
                    {T.common.refresh}
                </Button>
            </EmptyStateActions>
        </EmptyStateFooter>
    </EmptyState>
);
