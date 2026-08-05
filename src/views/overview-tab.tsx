import {
    Alert,
    Button,
    Card,
    CardBody,
    CardTitle,
    DescriptionList,
    DescriptionListDescription,
    DescriptionListGroup,
    DescriptionListTerm,
    Grid,
    GridItem,
    Label,
    Progress,
    ProgressMeasureLocation,
    Select,
    SelectList,
    SelectOption,
    MenuToggle,
    type MenuToggleElement,
} from "@patternfly/react-core";
import { useState } from "react";

import {
    K,
    ConflictError,
    type Container,
    type ContainerDriver,
    type Metrics,
    type Profile,
    type ServerInfo,
    _,
    format,
} from "../backend";

const formatBytes = (bytes: number): string => {
    if (bytes <= 0)
        return "0 B";
    const units = ["B", "KiB", "MiB", "GiB", "TiB"];
    const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const value = bytes / 1024 ** exponent;
    return `${value.toFixed(value >= 100 || exponent === 0 ? 0 : 1)} ${units[exponent]}`;
};

interface OverviewTabProps {
    container: Container;
    etag: string | null;
    info: ServerInfo;
    profiles: readonly Profile[];
    /** Null while the container is not running. */
    metrics: Metrics | null;
    driver: ContainerDriver;
    onSaved: () => void;
}

export const OverviewTab = ({
    container,
    etag,
    info,
    profiles,
    metrics,
    driver,
    onSaved,
}: OverviewTabProps) => {
    const [profileOpen, setProfileOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const applyProfiles = async (next: string[]) => {
        if (etag === null)
            return;
        setBusy(true);
        setError(null);
        try {
            await driver.updateConfig(container.name, {
                architecture: container.architecture,
                description: container.description,
                ephemeral: container.ephemeral,
                profiles: next,
                config: container.localConfig,
                devices: container.localDevices,
            }, etag);
            onSaved();
        } catch (caught) {
            setError(caught instanceof ConflictError
                ? _(K.overview_tab.another_session_changed_this_container_reload)
                : caught instanceof Error ? caught.message : String(caught));
        } finally {
            setBusy(false);
            setProfileOpen(false);
        }
    };

    const memoryPercent = metrics !== null && metrics.memoryTotalBytes > 0
        ? Math.round((metrics.memoryUsedBytes / metrics.memoryTotalBytes) * 100)
        : null;

    return (
        <Grid hasGutter>
            <GridItem span={12}>
                {error !== null && <Alert variant="danger" isInline title={error} />}
            </GridItem>

            <GridItem md={6} span={12}>
                <Card isPlain>
                    <CardTitle>{_(K.overview_tab.identity)}</CardTitle>
                    <CardBody>
                        <DescriptionList isHorizontal isCompact>
                            <DescriptionListGroup>
                                <DescriptionListTerm>{_(K.overview_tab.description)}</DescriptionListTerm>
                                <DescriptionListDescription>
                                    {container.description || <span className="lxc-muted">{_(K.container_list.none)}</span>}
                                </DescriptionListDescription>
                            </DescriptionListGroup>
                            <DescriptionListGroup>
                                <DescriptionListTerm>{_(K.container_list.architecture)}</DescriptionListTerm>
                                <DescriptionListDescription>{container.architecture}</DescriptionListDescription>
                            </DescriptionListGroup>
                            <DescriptionListGroup>
                                <DescriptionListTerm>{_(K.overview_tab.ephemeral)}</DescriptionListTerm>
                                <DescriptionListDescription>
                                    {container.ephemeral ? _(K.overview_tab.yes_deleted_when_stopped) : _(K.overview_tab.no)}
                                </DescriptionListDescription>
                            </DescriptionListGroup>
                            <DescriptionListGroup>
                                <DescriptionListTerm>{_(K.container_list.created)}</DescriptionListTerm>
                                <DescriptionListDescription>
                                    {container.createdAt === ""
                                        ? <span className="lxc-muted">{_(K.container_state_label.unknown)}</span>
                                        : new Date(container.createdAt).toLocaleString()}
                                </DescriptionListDescription>
                            </DescriptionListGroup>
                            <DescriptionListGroup>
                                <DescriptionListTerm>{_(K.overview_tab.incus)}</DescriptionListTerm>
                                <DescriptionListDescription>
                                    {info.serverVersion} (API {info.apiVersion})
                                </DescriptionListDescription>
                            </DescriptionListGroup>
                        </DescriptionList>
                    </CardBody>
                </Card>
            </GridItem>

            <GridItem md={6} span={12}>
                <Card isPlain>
                    <CardTitle>{_(K.container_list.profiles)}</CardTitle>
                    <CardBody>
                        <p className="lxc-config__description">
                            {_(K.overview_tab.profiles_supply_configuration_and_devices_to)}
                        </p>
                        {/* PatternFly 6 replaced Chip with Label. */}
                        <div className="lxc-chips">
                            {container.profiles.map((name) => (
                                <Label key={name} isCompact color="blue">{name}</Label>
                            ))}
                        </div>
                        <Select
                            isOpen={profileOpen}
                            selected={[...container.profiles]}
                            onOpenChange={setProfileOpen}
                            onSelect={(_event, value) => {
                                const name = String(value);
                                const next = container.profiles.includes(name)
                                    ? container.profiles.filter((p) => p !== name)
                                    : [...container.profiles, name];
                                void applyProfiles(next);
                            }}
                            toggle={(ref: React.Ref<MenuToggleElement>) => (
                                <MenuToggle
                                    ref={ref}
                                    onClick={() => setProfileOpen((open) => !open)}
                                    isExpanded={profileOpen}
                                    isDisabled={busy || etag === null}
                                >
                                    {_(K.overview_tab.change_profiles)}
                                </MenuToggle>
                            )}
                        >
                            <SelectList>
                                {profiles.map((profile) => (
                                    <SelectOption
                                        key={profile.name}
                                        value={profile.name}
                                        hasCheckbox
                                        isSelected={container.profiles.includes(profile.name)}
                                    >
                                        {profile.name}
                                    </SelectOption>
                                ))}
                            </SelectList>
                        </Select>
                    </CardBody>
                </Card>
            </GridItem>

            <GridItem span={12}>
                <Card isPlain>
                    <CardTitle>{_(K.overview_tab.resource_usage)}</CardTitle>
                    <CardBody>
                        {metrics === null
                            ? (
                                <p className="lxc-muted">
                                    {_(K.overview_tab.usage_is_reported_only_while_the)}
                                </p>
                            )
                            : (
                                <DescriptionList isHorizontal isCompact>
                                    <DescriptionListGroup>
                                        <DescriptionListTerm>{_(K.fields.memory)}</DescriptionListTerm>
                                        <DescriptionListDescription>
                                            {memoryPercent === null
                                                ? formatBytes(metrics.memoryUsedBytes)
                                                : (
                                                    <Progress
                                                        value={memoryPercent}
                                                        measureLocation={ProgressMeasureLocation.outside}
                                                        aria-label={_(K.overview_tab.memory_usage)}
                                                        title=""
                                                        label={format(_(K.container_list.of), formatBytes(metrics.memoryUsedBytes), formatBytes(metrics.memoryTotalBytes))}
                                                    />
                                                )}
                                        </DescriptionListDescription>
                                    </DescriptionListGroup>
                                    <DescriptionListGroup>
                                        <DescriptionListTerm>{_(K.overview_tab.cpu_time)}</DescriptionListTerm>
                                        <DescriptionListDescription>
                                            {metrics.cpuSecondsTotal.toFixed(1)} s
                                        </DescriptionListDescription>
                                    </DescriptionListGroup>
                                    <DescriptionListGroup>
                                        <DescriptionListTerm>{_(K.container_detail.network)}</DescriptionListTerm>
                                        <DescriptionListDescription>
                                            {format(_(K.overview_tab.in_out), formatBytes(metrics.networkReceiveBytes), formatBytes(metrics.networkTransmitBytes))}
                                        </DescriptionListDescription>
                                    </DescriptionListGroup>
                                </DescriptionList>
                            )}
                    </CardBody>
                </Card>
            </GridItem>

            <GridItem span={12}>
                <Card isPlain>
                    <CardTitle>{_(K.container_list.addresses)}</CardTitle>
                    <CardBody>
                        {container.interfaces.length === 0
                            ? <p className="lxc-muted">{_(K.overview_tab.no_interfaces_are_up)}</p>
                            : (
                                <DescriptionList isHorizontal isCompact>
                                    {container.interfaces.map((iface) => (
                                        <DescriptionListGroup key={iface.name}>
                                            <DescriptionListTerm>{iface.name}</DescriptionListTerm>
                                            <DescriptionListDescription>
                                                <div>{iface.hwaddr}</div>
                                                {iface.addresses.map((address) => (
                                                    <div key={address.address}>
                                                        {address.address}/{address.netmask}{" "}
                                                        <span className="lxc-muted">({address.scope})</span>
                                                    </div>
                                                ))}
                                            </DescriptionListDescription>
                                        </DescriptionListGroup>
                                    ))}
                                </DescriptionList>
                            )}
                    </CardBody>
                </Card>
            </GridItem>
        </Grid>
    );
};

export { Button };
