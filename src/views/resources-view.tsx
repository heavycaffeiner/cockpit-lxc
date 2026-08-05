import {
    Alert,
    Button,
    Card,
    CardBody,
    Form,
    FormGroup,
    FormHelperText,
    HelperText,
    HelperTextItem,
    Label,
    Modal,
    ModalBody,
    ModalFooter,
    ModalHeader,
    Spinner,
    Tab,
    TabTitleText,
    Tabs,
    TextInput,
    Tooltip,
} from "@patternfly/react-core";
import { Table, Tbody, Td, Th, Thead, Tr } from "@patternfly/react-table";
import { useCallback, useEffect, useState } from "react";

import {
    K,
    _,
    format,
    type ContainerDriver,
    type Image,
    type Network,
    type Profile,
    type StoragePool,
} from "../backend";

type ResourceTab = "images" | "profiles" | "networks" | "storage";

const errorText = (error: unknown): string =>
    error instanceof Error ? error.message : String(error);

const formatBytes = (bytes: number): string => {
    if (bytes <= 0)
        return "0 B";
    const units = ["B", "KiB", "MiB", "GiB", "TiB"];
    const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const value = bytes / 1024 ** exponent;
    return `${value.toFixed(value >= 100 || exponent === 0 ? 0 : 1)} ${units[exponent]}`;
};

const formatTime = (iso: string): string => {
    if (iso === "")
        return "";
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
};

interface ResourcesViewProps {
    driver: ContainerDriver;
    profiles: readonly Profile[];
    onRefresh: () => void;
}

export const ResourcesView = ({ driver, profiles, onRefresh }: ResourcesViewProps) => {
    const [tab, setTab] = useState<ResourceTab>("images");

    return (
        <Card isPlain>
            <CardBody>
                <Tabs
                    activeKey={tab}
                    onSelect={(_event, key) => setTab(key as ResourceTab)}
                    aria-label={_(K.resources_view.incus_resources)}
                    role="region"
                >
                    <Tab eventKey="images"
                        title={<TabTitleText>{_(K.resources_view.images)}</TabTitleText>}>
                        <ImagesTab driver={driver} onRefresh={onRefresh} />
                    </Tab>
                    <Tab eventKey="profiles"
                        title={<TabTitleText>{_(K.resources_view.profiles)}</TabTitleText>}>
                        <ProfilesTab profiles={profiles} />
                    </Tab>
                    <Tab eventKey="networks"
                        title={<TabTitleText>{_(K.resources_view.networks)}</TabTitleText>}>
                        <NetworksTab driver={driver} />
                    </Tab>
                    <Tab eventKey="storage"
                        title={<TabTitleText>{_(K.resources_view.storage_pools)}</TabTitleText>}>
                        <StorageTab driver={driver} />
                    </Tab>
                </Tabs>
            </CardBody>
        </Card>
    );
};

const ImagesTab = ({
    driver,
    onRefresh,
}: {
    driver: ContainerDriver;
    onRefresh: () => void;
}) => {
    const [images, setImages] = useState<Image[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [pulling, setPulling] = useState(false);
    const [progress, setProgress] = useState<string | null>(null);
    const [aliasing, setAliasing] = useState<Image | null>(null);
    const [deleting, setDeleting] = useState<Image | null>(null);
    const [busy, setBusy] = useState(false);

    const load = useCallback(() => {
        driver.listImages().then(
            (result) => { setImages(result); setError(null); },
            (caught: unknown) => { setImages([]); setError(errorText(caught)); },
        );
    }, [driver]);

    useEffect(load, [load]);

    const run = async (action: () => Promise<void>) => {
        setBusy(true);
        setError(null);
        try {
            await action();
            load();
            onRefresh();
        } catch (caught) {
            setError(errorText(caught));
        } finally {
            setBusy(false);
            setProgress(null);
        }
    };

    if (images === null)
        return <Spinner aria-label={_(K.resources_view.loading_images)} />;

    return (
        <div className="lxc-resource">
            {error !== null && <Alert variant="danger" isInline title={error} />}
            {progress !== null && (
                <Alert variant="info" isInline
                    title={format(_(K.resources_view.downloading), progress)} />
            )}

            <div className="lxc-page__toolbar">
                <Button variant="primary" onClick={() => setPulling(true)} isDisabled={busy}>
                    {_(K.resources_view.pull_image)}
                </Button>
                <Button variant="secondary" onClick={load} isDisabled={busy}>
                    {_(K.resources_view.refresh)}
                </Button>
            </div>

            {images.length === 0
                ? <p className="lxc-muted">{_(K.resources_view.no_images_are_cached_on_this)}</p>
                : (
                    <Table aria-label={_(K.resources_view.local_images)} variant="compact">
                        <Thead>
                            <Tr>
                                <Th modifier="nowrap">{_(K.resources_view.name)}</Th>
                                <Th modifier="nowrap">{_(K.resources_view.fingerprint)}</Th>
                                <Th modifier="nowrap">{_(K.resources_view.architecture)}</Th>
                                <Th modifier="nowrap">{_(K.resources_view.size)}</Th>
                                <Th modifier="nowrap">{_(K.resources_view.added)}</Th>
                                <Th screenReaderText={_(K.resources_view.actions)} />
                            </Tr>
                        </Thead>
                        <Tbody>
                            {images.map((image) => (
                                <Tr key={image.fingerprint}>
                                    <Td dataLabel={_(K.resources_view.name)}>
                                        {image.aliases.length > 0
                                            ? image.aliases.map((alias) => (
                                                <Label key={alias} isCompact color="blue">{alias}</Label>
                                            ))
                                            : <span className="lxc-muted">{_(K.resources_view.no_alias)}</span>}
                                        <div className="lxc-row__description">{image.description}</div>
                                    </Td>
                                    <Td dataLabel={_(K.resources_view.fingerprint)}>
                                        <Tooltip content={image.fingerprint}>
                                            <code>{image.fingerprint.slice(0, 12)}</code>
                                        </Tooltip>
                                    </Td>
                                    <Td dataLabel={_(K.resources_view.architecture)}>{image.architecture}</Td>
                                    <Td dataLabel={_(K.resources_view.size)}>{formatBytes(image.size)}</Td>
                                    <Td dataLabel={_(K.resources_view.added)}>{formatTime(image.uploadedAt)}</Td>
                                    {/*
                                      * The actions get their own row layout
                                      * rather than inline text, so neither
                                      * label wraps mid-phrase into "Add" over
                                      * "alias" when the column is narrow.
                                      */}
                                    <Td isActionCell modifier="nowrap">
                                        <div className="lxc-rowactions">
                                            <Button variant="secondary" isDisabled={busy}
                                                onClick={() => setAliasing(image)}>
                                                {_(K.resources_view.add_alias)}
                                            </Button>
                                            <Button variant="link" isDanger isDisabled={busy}
                                                onClick={() => setDeleting(image)}>
                                                {_(K.resources_view.delete)}
                                            </Button>
                                        </div>
                                    </Td>
                                </Tr>
                            ))}
                        </Tbody>
                    </Table>
                )}

            {pulling && (
                <PullImageDialog
                    onClose={() => setPulling(false)}
                    onConfirm={(alias, remote) =>
                        run(() => driver.pullImage(alias, remote, setProgress))}
                />
            )}

            {aliasing !== null && (
                <AliasDialog
                    image={aliasing}
                    onClose={() => setAliasing(null)}
                    onConfirm={(alias, description) =>
                        run(() => driver.createImageAlias(aliasing.fingerprint, alias, description))}
                />
            )}

            {deleting !== null && (
                <Modal isOpen variant="small" onClose={() => setDeleting(null)}
                    aria-label={_(K.resources_view.delete_image)}>
                    <ModalHeader title={_(K.resources_view.delete_this_image)}
                        titleIconVariant="danger" />
                    <ModalBody>
                        <p>
                            {format(
                                _(K.resources_view.is_removed_from_this_host_containers),
                                deleting.description || deleting.fingerprint.slice(0, 12),
                            )}
                        </p>
                    </ModalBody>
                    <ModalFooter>
                        <Button variant="danger" isDisabled={busy} isLoading={busy}
                            onClick={() => {
                                const target = deleting;
                                setDeleting(null);
                                void run(() => driver.deleteImage(target.fingerprint));
                            }}>
                            {_(K.resources_view.delete)}
                        </Button>
                        <Button variant="link" onClick={() => setDeleting(null)}>
                            {_(K.resources_view.cancel)}
                        </Button>
                    </ModalFooter>
                </Modal>
            )}
        </div>
    );
};

const PullImageDialog = ({
    onClose,
    onConfirm,
}: {
    onClose: () => void;
    onConfirm: (alias: string, remote: string) => Promise<void>;
}) => {
    const [value, setValue] = useState("images:debian/12");
    const valid = value.trim() !== "";

    /*
     * The example alias is an element rather than text, so the sentence around
     * it is split on its placeholder instead of being formatted. That keeps the
     * whole sentence one translatable string with the example free to move,
     * which languages that order the clause differently need.
     */
    const [before = "", after = ""] =
        _(K.resources_view.an_alias_on_a_configured_remote).split("$0");

    return (
        <Modal isOpen variant="small" onClose={onClose}
            aria-label={_(K.resources_view.pull_image)}>
            <ModalHeader title={_(K.resources_view.pull_an_image)} />
            <ModalBody>
                <Form onSubmit={(event) => { event.preventDefault(); }}>
                    <FormGroup label={_(K.resources_view.image)} fieldId="lxc-pull-alias" isRequired>
                        <TextInput
                            id="lxc-pull-alias"
                            value={value}
                            onChange={(_event, next) => setValue(next)}
                            aria-label={_(K.resources_view.image_to_pull)}
                            autoComplete="off"
                        />
                        <FormHelperText>
                            <HelperText>
                                <HelperTextItem>
                                    {before}<code>images:alpine/3.21</code>{after}
                                </HelperTextItem>
                            </HelperText>
                        </FormHelperText>
                    </FormGroup>
                </Form>
            </ModalBody>
            <ModalFooter>
                <Button variant="primary" isDisabled={!valid} onClick={() => {
                    const separator = value.indexOf(":");
                    const remote = separator === -1 ? "images" : value.slice(0, separator);
                    const alias = separator === -1 ? value : value.slice(separator + 1);
                    void onConfirm(alias, remote);
                    onClose();
                }}>
                    {_(K.resources_view.pull)}
                </Button>
                <Button variant="link" onClick={onClose}>{_(K.resources_view.cancel)}</Button>
            </ModalFooter>
        </Modal>
    );
};

const AliasDialog = ({
    image,
    onClose,
    onConfirm,
}: {
    image: Image;
    onClose: () => void;
    onConfirm: (alias: string, description: string) => Promise<void>;
}) => {
    const [alias, setAlias] = useState("");
    const [description, setDescription] = useState(image.description);
    const valid = alias.trim() !== "";

    return (
        <Modal isOpen variant="small" onClose={onClose}
            aria-label={_(K.resources_view.add_image_alias)}>
            <ModalHeader title={_(K.resources_view.name_this_image)} />
            <ModalBody>
                <Form onSubmit={(event) => event.preventDefault()}>
                    <FormGroup label={_(K.resources_view.alias)} fieldId="lxc-alias-name" isRequired>
                        <TextInput id="lxc-alias-name" value={alias}
                            onChange={(_event, next) => setAlias(next)}
                            aria-label={_(K.resources_view.alias)} autoComplete="off" />
                        <FormHelperText>
                            <HelperText>
                                <HelperTextItem>
                                    {_(K.resources_view.a_short_name_to_use_instead)}
                                </HelperTextItem>
                            </HelperText>
                        </FormHelperText>
                    </FormGroup>
                    <FormGroup label={_(K.resources_view.description)} fieldId="lxc-alias-desc">
                        <TextInput id="lxc-alias-desc" value={description}
                            onChange={(_event, next) => setDescription(next)}
                            aria-label={_(K.resources_view.description)} />
                    </FormGroup>
                </Form>
            </ModalBody>
            <ModalFooter>
                <Button variant="primary" isDisabled={!valid} onClick={() => {
                    void onConfirm(alias.trim(), description);
                    onClose();
                }}>
                    {_(K.resources_view.add_alias)}
                </Button>
                <Button variant="link" onClick={onClose}>{_(K.resources_view.cancel)}</Button>
            </ModalFooter>
        </Modal>
    );
};

const ProfilesTab = ({ profiles }: { profiles: readonly Profile[] }) => (
    <div className="lxc-resource">
        <p className="lxc-config__description">
            {_(K.resources_view.profiles_supply_configuration_and_devices_to)}
        </p>
        <Table aria-label={_(K.resources_view.profiles)} variant="compact">
            <Thead>
                <Tr>
                    <Th modifier="nowrap">{_(K.resources_view.name)}</Th>
                    <Th modifier="nowrap">{_(K.resources_view.description)}</Th>
                    <Th>{_(K.resources_view.devices)}</Th>
                    <Th modifier="nowrap">{_(K.resources_view.used_by)}</Th>
                </Tr>
            </Thead>
            <Tbody>
                {profiles.map((profile) => (
                    <Tr key={profile.name}>
                        <Td dataLabel={_(K.resources_view.name)}><strong>{profile.name}</strong></Td>
                        <Td dataLabel={_(K.resources_view.description)}>
                            {profile.description ||
                                <span className="lxc-muted">{_(K.resources_view.none)}</span>}
                        </Td>
                        <Td dataLabel={_(K.resources_view.devices)}>
                            {Object.entries(profile.devices).map(([name, device]) => (
                                <div key={name}>
                                    <code>{name}</code>{" "}
                                    <span className="lxc-muted">
                                        {device["type"]}
                                        {device["network"] !== undefined &&
                                            format(_(K.resources_view.on_network), device["network"])}
                                        {device["pool"] !== undefined &&
                                            format(_(K.resources_view.in_pool), device["pool"])}
                                    </span>
                                </div>
                            ))}
                        </Td>
                        <Td dataLabel={_(K.resources_view.used_by)}>{profile.usedBy.length}</Td>
                    </Tr>
                ))}
            </Tbody>
        </Table>
    </div>
);

const NetworksTab = ({ driver }: { driver: ContainerDriver }) => {
    const [networks, setNetworks] = useState<Network[] | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        driver.listNetworks().then(
            setNetworks,
            (caught: unknown) => { setNetworks([]); setError(errorText(caught)); },
        );
    }, [driver]);

    if (networks === null)
        return <Spinner aria-label={_(K.resources_view.loading_networks)} />;

    return (
        <div className="lxc-resource">
            {error !== null && <Alert variant="danger" isInline title={error} />}
            <p className="lxc-config__description">
                {_(K.resources_view.managed_networks_are_created_and_maintained)}
            </p>
            <Table aria-label={_(K.resources_view.networks)} variant="compact">
                <Thead>
                    <Tr>
                        <Th modifier="nowrap">{_(K.resources_view.name)}</Th>
                        <Th modifier="nowrap">{_(K.resources_view.type)}</Th>
                        <Th modifier="nowrap">{_(K.resources_view.managed)}</Th>
                        <Th>{_(K.resources_view.addresses)}</Th>
                        <Th modifier="nowrap">{_(K.resources_view.used_by)}</Th>
                    </Tr>
                </Thead>
                <Tbody>
                    {networks.map((network) => (
                        <Tr key={network.name}>
                            <Td dataLabel={_(K.resources_view.name)}><strong>{network.name}</strong></Td>
                            <Td dataLabel={_(K.resources_view.type)}>{network.type}</Td>
                            <Td dataLabel={_(K.resources_view.managed)}>
                                {network.managed
                                    ? <Label isCompact color="green">{_(K.resources_view.managed)}</Label>
                                    : <Label isCompact color="grey">{_(K.resources_view.unmanaged)}</Label>}
                            </Td>
                            <Td dataLabel={_(K.resources_view.addresses)}>
                                {network.config["ipv4.address"] !== undefined && (
                                    <div>{network.config["ipv4.address"]}</div>
                                )}
                                {network.config["ipv6.address"] !== undefined && (
                                    <div>{network.config["ipv6.address"]}</div>
                                )}
                                {network.config["ipv4.address"] === undefined &&
                                    network.config["ipv6.address"] === undefined && (
                                    <span className="lxc-muted">{_(K.resources_view.none)}</span>
                                )}
                            </Td>
                            <Td dataLabel={_(K.resources_view.used_by)}>{network.usedBy.length}</Td>
                        </Tr>
                    ))}
                </Tbody>
            </Table>
        </div>
    );
};

const StorageTab = ({ driver }: { driver: ContainerDriver }) => {
    const [pools, setPools] = useState<StoragePool[] | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        driver.listStoragePools().then(
            setPools,
            (caught: unknown) => { setPools([]); setError(errorText(caught)); },
        );
    }, [driver]);

    if (pools === null)
        return <Spinner aria-label={_(K.resources_view.loading_storage_pools)} />;

    return (
        <div className="lxc-resource">
            {error !== null && <Alert variant="danger" isInline title={error} />}
            <Table aria-label={_(K.resources_view.storage_pools)} variant="compact">
                <Thead>
                    <Tr>
                        <Th modifier="nowrap">{_(K.resources_view.name)}</Th>
                        <Th modifier="nowrap">{_(K.resources_view.driver)}</Th>
                        <Th>{_(K.resources_view.source)}</Th>
                        <Th modifier="nowrap">{_(K.resources_view.used_by)}</Th>
                    </Tr>
                </Thead>
                <Tbody>
                    {pools.map((pool) => (
                        <Tr key={pool.name}>
                            <Td dataLabel={_(K.resources_view.name)}><strong>{pool.name}</strong></Td>
                            <Td dataLabel={_(K.resources_view.driver)}>{pool.driver}</Td>
                            <Td dataLabel={_(K.resources_view.source)}>
                                <code>{pool.config["source"] ?? ""}</code>
                            </Td>
                            <Td dataLabel={_(K.resources_view.used_by)}>{pool.usedBy.length}</Td>
                        </Tr>
                    ))}
                </Tbody>
            </Table>
        </div>
    );
};
