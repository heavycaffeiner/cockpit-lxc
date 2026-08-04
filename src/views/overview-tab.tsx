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
    ConflictError,
    type Container,
    type ContainerDriver,
    type Metrics,
    type Profile,
    type ServerInfo,
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
                ? "Another session changed this container. Reload and try again."
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
                    <CardTitle>Identity</CardTitle>
                    <CardBody>
                        <DescriptionList isHorizontal isCompact>
                            <DescriptionListGroup>
                                <DescriptionListTerm>Description</DescriptionListTerm>
                                <DescriptionListDescription>
                                    {container.description || <span className="lxc-muted">None</span>}
                                </DescriptionListDescription>
                            </DescriptionListGroup>
                            <DescriptionListGroup>
                                <DescriptionListTerm>Architecture</DescriptionListTerm>
                                <DescriptionListDescription>{container.architecture}</DescriptionListDescription>
                            </DescriptionListGroup>
                            <DescriptionListGroup>
                                <DescriptionListTerm>Ephemeral</DescriptionListTerm>
                                <DescriptionListDescription>
                                    {container.ephemeral ? "Yes, deleted when stopped" : "No"}
                                </DescriptionListDescription>
                            </DescriptionListGroup>
                            <DescriptionListGroup>
                                <DescriptionListTerm>Created</DescriptionListTerm>
                                <DescriptionListDescription>
                                    {container.createdAt === ""
                                        ? <span className="lxc-muted">Unknown</span>
                                        : new Date(container.createdAt).toLocaleString()}
                                </DescriptionListDescription>
                            </DescriptionListGroup>
                            <DescriptionListGroup>
                                <DescriptionListTerm>Incus</DescriptionListTerm>
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
                    <CardTitle>Profiles</CardTitle>
                    <CardBody>
                        <p className="lxc-config__description">
                            Profiles supply configuration and devices to every container that
                            applies them. Order matters: a later profile wins.
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
                                    Change profiles
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
                    <CardTitle>Resource usage</CardTitle>
                    <CardBody>
                        {metrics === null
                            ? (
                                <p className="lxc-muted">
                                    Usage is reported only while the container runs.
                                </p>
                            )
                            : (
                                <DescriptionList isHorizontal isCompact>
                                    <DescriptionListGroup>
                                        <DescriptionListTerm>Memory</DescriptionListTerm>
                                        <DescriptionListDescription>
                                            {memoryPercent === null
                                                ? formatBytes(metrics.memoryUsedBytes)
                                                : (
                                                    <Progress
                                                        value={memoryPercent}
                                                        measureLocation={ProgressMeasureLocation.outside}
                                                        aria-label="Memory usage"
                                                        title=""
                                                        label={`${formatBytes(metrics.memoryUsedBytes)} of ${formatBytes(metrics.memoryTotalBytes)}`}
                                                    />
                                                )}
                                        </DescriptionListDescription>
                                    </DescriptionListGroup>
                                    <DescriptionListGroup>
                                        <DescriptionListTerm>CPU time</DescriptionListTerm>
                                        <DescriptionListDescription>
                                            {metrics.cpuSecondsTotal.toFixed(1)} s
                                        </DescriptionListDescription>
                                    </DescriptionListGroup>
                                    <DescriptionListGroup>
                                        <DescriptionListTerm>Network</DescriptionListTerm>
                                        <DescriptionListDescription>
                                            {formatBytes(metrics.networkReceiveBytes)} in,{" "}
                                            {formatBytes(metrics.networkTransmitBytes)} out
                                        </DescriptionListDescription>
                                    </DescriptionListGroup>
                                </DescriptionList>
                            )}
                    </CardBody>
                </Card>
            </GridItem>

            <GridItem span={12}>
                <Card isPlain>
                    <CardTitle>Addresses</CardTitle>
                    <CardBody>
                        {container.interfaces.length === 0
                            ? <p className="lxc-muted">No interfaces are up.</p>
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
