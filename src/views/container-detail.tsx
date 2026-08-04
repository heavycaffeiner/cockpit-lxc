import {
    Alert,
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
    Spinner,
    Tab,
    TabTitleText,
    Tabs,
} from "@patternfly/react-core";
import { PlayIcon } from "@patternfly/react-icons";
import { useState } from "react";

import type {
    Container,
    ContainerDriver,
    Metrics,
    Profile,
    ServerInfo,
} from "../backend";
import { ContainerStateLabel } from "../components/container-state-label";
import { TerminalPane } from "../components/terminal";
import { useContainerDetail } from "../hooks/use-container-detail";
import { ConfigurationTab } from "./configuration-tab";
import { DevicesTab, DISK_SPEC, NIC_SPEC } from "./devices-tab";
import { OverviewTab } from "./overview-tab";
import { SnapshotsTab } from "./snapshots-tab";

type DetailTab =
    | "overview"
    | "configuration"
    | "network"
    | "storage"
    | "snapshots"
    | "terminal"
    | "console";

interface ContainerDetailProps {
    /** From the list, so the header stays current with the event stream. */
    container: Container;
    info: ServerInfo;
    profiles: readonly Profile[];
    metrics: Metrics | undefined;
    driver: ContainerDriver;
    generation: number;
    onBack: () => void;
    onRefresh: () => void;
}

export const ContainerDetail = ({
    container,
    info,
    profiles,
    metrics,
    driver,
    generation,
    onBack,
    onRefresh,
}: ContainerDetailProps) => {
    const [tab, setTab] = useState<DetailTab>("overview");
    const [starting, setStarting] = useState(false);

    /*
     * A second fetch, because writing needs an ETag and the list's bulk request
     * does not carry one. The list copy still drives the header, so state
     * changes arriving over the event stream show up without refetching this.
     */
    const detail = useContainerDetail(driver, container.name, generation);
    const editable = detail.container;

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

    const saved = () => {
        detail.reload();
        onRefresh();
    };

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

    const editingUnavailable = (
        <Alert
            variant="warning"
            isInline
            title={detail.error ?? "This container could not be loaded for editing."}
        />
    );

    return (
        <div className="lxc-detail">
            <Breadcrumb className="lxc-detail__crumbs">
                <BreadcrumbItem to="#" onClick={onBack}>Containers</BreadcrumbItem>
                <BreadcrumbItem isActive>{container.name}</BreadcrumbItem>
            </Breadcrumb>

            <Flex
                alignItems={{ default: "alignItemsCenter" }}
                spaceItems={{ default: "spaceItemsMd" }}
                className="lxc-detail__header"
            >
                <FlexItem><Content component="h2">{container.name}</Content></FlexItem>
                <FlexItem><ContainerStateLabel state={container.state} /></FlexItem>
            </Flex>

            <Card isPlain>
                <CardBody>
                    <Tabs
                        activeKey={tab}
                        onSelect={(_event, key) => setTab(key as DetailTab)}
                        aria-label={`Views for ${container.name}`}
                        role="region"
                    >
                        <Tab eventKey="overview" title={<TabTitleText>Overview</TabTitleText>}>
                            {detail.loading && editable === null
                                ? <Spinner aria-label="Loading container" />
                                : editable === null
                                    ? editingUnavailable
                                    : (
                                        <OverviewTab
                                            container={editable}
                                            etag={detail.etag}
                                            info={info}
                                            profiles={profiles}
                                            metrics={metrics}
                                            driver={driver}
                                            onSaved={saved}
                                        />
                                    )}
                        </Tab>

                        <Tab eventKey="configuration" title={<TabTitleText>Configuration</TabTitleText>}>
                            {editable === null
                                ? (detail.loading ? <Spinner aria-label="Loading" /> : editingUnavailable)
                                : (
                                    <ConfigurationTab
                                        container={editable}
                                        etag={detail.etag}
                                        info={info}
                                        driver={driver}
                                        onSaved={saved}
                                    />
                                )}
                        </Tab>

                        <Tab eventKey="network" title={<TabTitleText>Network</TabTitleText>}>
                            {editable === null
                                ? (detail.loading ? <Spinner aria-label="Loading" /> : editingUnavailable)
                                : (
                                    <DevicesTab
                                        spec={NIC_SPEC}
                                        container={editable}
                                        etag={detail.etag}
                                        driver={driver}
                                        onSaved={saved}
                                    />
                                )}
                        </Tab>

                        <Tab eventKey="storage" title={<TabTitleText>Storage</TabTitleText>}>
                            {editable === null
                                ? (detail.loading ? <Spinner aria-label="Loading" /> : editingUnavailable)
                                : (
                                    <DevicesTab
                                        spec={DISK_SPEC}
                                        container={editable}
                                        etag={detail.etag}
                                        driver={driver}
                                        onSaved={saved}
                                    />
                                )}
                        </Tab>

                        <Tab eventKey="snapshots" title={<TabTitleText>Snapshots</TabTitleText>}>
                            <SnapshotsTab
                                container={container}
                                driver={driver}
                                onChanged={saved}
                            />
                        </Tab>

                        <Tab eventKey="terminal" title={<TabTitleText>Terminal</TabTitleText>}>
                            {running
                                ? <TerminalPane driver={driver} container={container.name} mode="exec" />
                                : notRunning}
                        </Tab>

                        <Tab eventKey="console" title={<TabTitleText>Console</TabTitleText>}>
                            {running
                                ? <TerminalPane driver={driver} container={container.name} mode="console" />
                                : notRunning}
                        </Tab>
                    </Tabs>
                </CardBody>
            </Card>
        </div>
    );
};
