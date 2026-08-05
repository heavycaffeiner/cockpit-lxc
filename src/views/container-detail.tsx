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

import {
    K,
    _,
    format,
    type Container,
    type ContainerDriver,
    type Profile,
    type ServerInfo,
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
    driver: ContainerDriver;
    generation: number;
    onBack: () => void;
    onRefresh: () => void;
}

export const ContainerDetail = ({
    container,
    info,
    profiles,
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
            titleText={format(_(K.container_detail.is_not_running), container.name)}
            status="info"
        >
            <EmptyStateBody>
                {_(K.container_detail.a_shell_needs_a_running_container)}
            </EmptyStateBody>
            <EmptyStateFooter>
                <EmptyStateActions>
                    <Button variant="primary" isLoading={starting} isDisabled={starting}
                        onClick={() => void start()}>
                        {format(_(K.container_detail.start), container.name)}
                    </Button>
                </EmptyStateActions>
            </EmptyStateFooter>
        </EmptyState>
    );

    const editingUnavailable = (
        <Alert
            variant="warning"
            isInline
            title={detail.error ?? _(K.container_detail.this_container_could_not_be_loaded)}
        />
    );

    return (
        <div className="lxc-detail">
            <Breadcrumb className="lxc-detail__crumbs">
                <BreadcrumbItem to="#" onClick={onBack}>{_(K.app.containers)}</BreadcrumbItem>
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
                        aria-label={format(_(K.container_detail.views_for), container.name)}
                        role="region"
                    >
                        <Tab eventKey="overview" title={<TabTitleText>{_(K.container_detail.overview)}</TabTitleText>}>
                            {detail.loading && editable === null
                                ? <Spinner aria-label={_(K.container_detail.loading_container)} />
                                : editable === null
                                    ? editingUnavailable
                                    : (
                                        <OverviewTab
                                            container={editable}
                                            etag={detail.etag}
                                            info={info}
                                            profiles={profiles}
                                            metrics={editable.metrics}
                                            driver={driver}
                                            onSaved={saved}
                                        />
                                    )}
                        </Tab>

                        <Tab eventKey="configuration" title={<TabTitleText>{_(K.container_detail.configuration)}</TabTitleText>}>
                            {editable === null
                                ? (detail.loading ? <Spinner aria-label={_(K.container_detail.loading)} /> : editingUnavailable)
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

                        <Tab eventKey="network" title={<TabTitleText>{_(K.container_detail.network)}</TabTitleText>}>
                            {editable === null
                                ? (detail.loading ? <Spinner aria-label={_(K.container_detail.loading)} /> : editingUnavailable)
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

                        <Tab eventKey="storage" title={<TabTitleText>{_(K.container_detail.storage)}</TabTitleText>}>
                            {editable === null
                                ? (detail.loading ? <Spinner aria-label={_(K.container_detail.loading)} /> : editingUnavailable)
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

                        <Tab eventKey="snapshots" title={<TabTitleText>{_(K.container_detail.snapshots)}</TabTitleText>}>
                            <SnapshotsTab
                                container={container}
                                driver={driver}
                                onChanged={saved}
                            />
                        </Tab>

                        <Tab eventKey="terminal" title={<TabTitleText>{_(K.container_detail.terminal)}</TabTitleText>}>
                            {running
                                ? <TerminalPane driver={driver} container={container.name} mode="exec" />
                                : notRunning}
                        </Tab>

                        <Tab eventKey="console" title={<TabTitleText>{_(K.container_detail.console)}</TabTitleText>}>
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
