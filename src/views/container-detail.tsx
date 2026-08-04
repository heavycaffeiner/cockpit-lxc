import {
    Breadcrumb,
    BreadcrumbItem,
    Button,
    Card,
    CardBody,
    Content,
    EmptyState,
    EmptyStateActions,
    EmptyStateBody,
    EmptyStateFooter,
    Flex,
    FlexItem,
    Tab,
    TabTitleText,
    Tabs,
} from "@patternfly/react-core";
import { PlayIcon } from "@patternfly/react-icons";
import { useState } from "react";

import type { Container, ContainerDriver } from "../backend";
import { ContainerStateLabel } from "../components/container-state-label";
import { TerminalPane } from "../components/terminal";

type DetailTab = "terminal" | "console";

interface ContainerDetailProps {
    container: Container;
    driver: ContainerDriver;
    onBack: () => void;
    onRefresh: () => void;
}

/**
 * Per-container view.
 *
 * Phase 4 fills in the two tabs that need a pty. Overview, Configuration,
 * Network, Storage and Snapshots join them in later phases; this shell exists so
 * they slot in rather than being bolted on.
 */
export const ContainerDetail = ({
    container,
    driver,
    onBack,
    onRefresh,
}: ContainerDetailProps) => {
    const [tab, setTab] = useState<DetailTab>("terminal");
    const [starting, setStarting] = useState(false);

    const running = container.state === "Running";

    const start = async () => {
        setStarting(true);
        try {
            await driver.setState(container.name, "start");
            onRefresh();
        } finally {
            setStarting(false);
        }
    };

    /*
     * A pty into a stopped container cannot work, and opening a channel that is
     * going to fail immediately would report the problem as a session that ended
     * for no clear reason. Offer the thing that would fix it instead.
     */
    const notRunning = (
        <EmptyState
            headingLevel="h2"
            icon={PlayIcon}
            titleText={`${container.name} is not running`}
            status="info"
        >
            <EmptyStateBody>
                A shell needs a running container. Start it to open a session.
            </EmptyStateBody>
            <EmptyStateFooter>
                <EmptyStateActions>
                    <Button variant="primary" isLoading={starting} isDisabled={starting}
                        onClick={() => void start()}>
                        Start {container.name}
                    </Button>
                </EmptyStateActions>
            </EmptyStateFooter>
        </EmptyState>
    );

    return (
        <div className="lxc-detail">
            <Breadcrumb className="lxc-detail__crumbs">
                <BreadcrumbItem to="#" onClick={onBack}>
                    Containers
                </BreadcrumbItem>
                <BreadcrumbItem isActive>{container.name}</BreadcrumbItem>
            </Breadcrumb>

            <Flex
                alignItems={{ default: "alignItemsCenter" }}
                spaceItems={{ default: "spaceItemsMd" }}
                className="lxc-detail__header"
            >
                <FlexItem>
                    <Content component="h2">{container.name}</Content>
                </FlexItem>
                <FlexItem>
                    <ContainerStateLabel state={container.state} />
                </FlexItem>
            </Flex>

            <Card isPlain>
                <CardBody>
                    <Tabs
                        activeKey={tab}
                        onSelect={(_event, key) => setTab(key as DetailTab)}
                        aria-label={`Views for ${container.name}`}
                        role="region"
                    >
                        <Tab eventKey="terminal" title={<TabTitleText>Terminal</TabTitleText>}>
                            {running
                                ? (
                                    <TerminalPane
                                        driver={driver}
                                        container={container.name}
                                        mode="exec"
                                    />
                                )
                                : notRunning}
                        </Tab>
                        <Tab eventKey="console" title={<TabTitleText>Console</TabTitleText>}>
                            {running
                                ? (
                                    <TerminalPane
                                        driver={driver}
                                        container={container.name}
                                        mode="console"
                                    />
                                )
                                : notRunning}
                        </Tab>
                    </Tabs>
                </CardBody>
            </Card>
        </div>
    );
};
