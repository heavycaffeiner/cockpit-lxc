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

import type {
    ContainerDriver,
    Image,
    Network,
    Profile,
    StoragePool,
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
                    aria-label="Incus resources"
                    role="region"
                >
                    <Tab eventKey="images" title={<TabTitleText>Images</TabTitleText>}>
                        <ImagesTab driver={driver} onRefresh={onRefresh} />
                    </Tab>
                    <Tab eventKey="profiles" title={<TabTitleText>Profiles</TabTitleText>}>
                        <ProfilesTab profiles={profiles} />
                    </Tab>
                    <Tab eventKey="networks" title={<TabTitleText>Networks</TabTitleText>}>
                        <NetworksTab driver={driver} />
                    </Tab>
                    <Tab eventKey="storage" title={<TabTitleText>Storage pools</TabTitleText>}>
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
        return <Spinner aria-label="Loading images" />;

    return (
        <div className="lxc-resource">
            {error !== null && <Alert variant="danger" isInline title={error} />}
            {progress !== null && (
                <Alert variant="info" isInline title={`Downloading: ${progress}`} />
            )}

            <div className="lxc-page__toolbar">
                <Button variant="primary" onClick={() => setPulling(true)} isDisabled={busy}>
                    Pull image
                </Button>
                <Button variant="secondary" onClick={load} isDisabled={busy}>
                    Refresh
                </Button>
            </div>

            {images.length === 0
                ? <p className="lxc-muted">No images are cached on this host.</p>
                : (
                    <Table aria-label="Local images" variant="compact">
                        <Thead>
                            <Tr>
                                <Th modifier="nowrap">Name</Th>
                                <Th modifier="nowrap">Fingerprint</Th>
                                <Th modifier="nowrap">Architecture</Th>
                                <Th modifier="nowrap">Size</Th>
                                <Th modifier="nowrap">Added</Th>
                                <Th screenReaderText="Actions" />
                            </Tr>
                        </Thead>
                        <Tbody>
                            {images.map((image) => (
                                <Tr key={image.fingerprint}>
                                    <Td dataLabel="Name">
                                        {image.aliases.length > 0
                                            ? image.aliases.map((alias) => (
                                                <Label key={alias} isCompact color="blue">{alias}</Label>
                                            ))
                                            : <span className="lxc-muted">No alias</span>}
                                        <div className="lxc-row__description">{image.description}</div>
                                    </Td>
                                    <Td dataLabel="Fingerprint">
                                        <Tooltip content={image.fingerprint}>
                                            <code>{image.fingerprint.slice(0, 12)}</code>
                                        </Tooltip>
                                    </Td>
                                    <Td dataLabel="Architecture">{image.architecture}</Td>
                                    <Td dataLabel="Size">{formatBytes(image.size)}</Td>
                                    <Td dataLabel="Added">{formatTime(image.uploadedAt)}</Td>
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
                                                Add alias
                                            </Button>
                                            <Button variant="link" isDanger isDisabled={busy}
                                                onClick={() => setDeleting(image)}>
                                                Delete
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
                    aria-label="Delete image">
                    <ModalHeader title="Delete this image?" titleIconVariant="danger" />
                    <ModalBody>
                        <p>
                            {deleting.description || deleting.fingerprint.slice(0, 12)} is removed
                            from this host. Containers already created from it keep working;
                            creating new ones will download it again.
                        </p>
                    </ModalBody>
                    <ModalFooter>
                        <Button variant="danger" isDisabled={busy} isLoading={busy}
                            onClick={() => {
                                const target = deleting;
                                setDeleting(null);
                                void run(() => driver.deleteImage(target.fingerprint));
                            }}>
                            Delete
                        </Button>
                        <Button variant="link" onClick={() => setDeleting(null)}>Cancel</Button>
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

    return (
        <Modal isOpen variant="small" onClose={onClose} aria-label="Pull image">
            <ModalHeader title="Pull an image" />
            <ModalBody>
                <Form onSubmit={(event) => { event.preventDefault(); }}>
                    <FormGroup label="Image" fieldId="lxc-pull-alias" isRequired>
                        <TextInput
                            id="lxc-pull-alias"
                            value={value}
                            onChange={(_event, next) => setValue(next)}
                            aria-label="Image to pull"
                            autoComplete="off"
                        />
                        <FormHelperText>
                            <HelperText>
                                <HelperTextItem>
                                    An alias on a configured remote, such as{" "}
                                    <code>images:alpine/3.21</code>. Large images take a while
                                    and the download runs in the background.
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
                    Pull
                </Button>
                <Button variant="link" onClick={onClose}>Cancel</Button>
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
        <Modal isOpen variant="small" onClose={onClose} aria-label="Add image alias">
            <ModalHeader title="Name this image" />
            <ModalBody>
                <Form onSubmit={(event) => event.preventDefault()}>
                    <FormGroup label="Alias" fieldId="lxc-alias-name" isRequired>
                        <TextInput id="lxc-alias-name" value={alias}
                            onChange={(_event, next) => setAlias(next)}
                            aria-label="Alias" autoComplete="off" />
                        <FormHelperText>
                            <HelperText>
                                <HelperTextItem>
                                    A short name to use instead of the fingerprint.
                                </HelperTextItem>
                            </HelperText>
                        </FormHelperText>
                    </FormGroup>
                    <FormGroup label="Description" fieldId="lxc-alias-desc">
                        <TextInput id="lxc-alias-desc" value={description}
                            onChange={(_event, next) => setDescription(next)}
                            aria-label="Description" />
                    </FormGroup>
                </Form>
            </ModalBody>
            <ModalFooter>
                <Button variant="primary" isDisabled={!valid} onClick={() => {
                    void onConfirm(alias.trim(), description);
                    onClose();
                }}>
                    Add alias
                </Button>
                <Button variant="link" onClick={onClose}>Cancel</Button>
            </ModalFooter>
        </Modal>
    );
};

const ProfilesTab = ({ profiles }: { profiles: readonly Profile[] }) => (
    <div className="lxc-resource">
        <p className="lxc-config__description">
            Profiles supply configuration and devices to every container that applies them.
            Editing a profile changes every container using it, which is why it is read-only
            here for now.
        </p>
        <Table aria-label="Profiles" variant="compact">
            <Thead>
                <Tr>
                    <Th modifier="nowrap">Name</Th>
                    <Th modifier="nowrap">Description</Th>
                    <Th>Devices</Th>
                    <Th modifier="nowrap">Used by</Th>
                </Tr>
            </Thead>
            <Tbody>
                {profiles.map((profile) => (
                    <Tr key={profile.name}>
                        <Td dataLabel="Name"><strong>{profile.name}</strong></Td>
                        <Td dataLabel="Description">
                            {profile.description || <span className="lxc-muted">None</span>}
                        </Td>
                        <Td dataLabel="Devices">
                            {Object.entries(profile.devices).map(([name, device]) => (
                                <div key={name}>
                                    <code>{name}</code>{" "}
                                    <span className="lxc-muted">
                                        {device["type"]}
                                        {device["network"] !== undefined && ` on ${device["network"]}`}
                                        {device["pool"] !== undefined && ` in ${device["pool"]}`}
                                    </span>
                                </div>
                            ))}
                        </Td>
                        <Td dataLabel="Used by">{profile.usedBy.length}</Td>
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
        return <Spinner aria-label="Loading networks" />;

    return (
        <div className="lxc-resource">
            {error !== null && <Alert variant="danger" isInline title={error} />}
            <p className="lxc-config__description">
                Managed networks are created and maintained by Incus. Unmanaged ones are host
                interfaces Incus can attach to but does not own.
            </p>
            <Table aria-label="Networks" variant="compact">
                <Thead>
                    <Tr>
                        <Th modifier="nowrap">Name</Th>
                        <Th modifier="nowrap">Type</Th>
                        <Th modifier="nowrap">Managed</Th>
                        <Th>Addresses</Th>
                        <Th modifier="nowrap">Used by</Th>
                    </Tr>
                </Thead>
                <Tbody>
                    {networks.map((network) => (
                        <Tr key={network.name}>
                            <Td dataLabel="Name"><strong>{network.name}</strong></Td>
                            <Td dataLabel="Type">{network.type}</Td>
                            <Td dataLabel="Managed">
                                {network.managed
                                    ? <Label isCompact color="green">Managed</Label>
                                    : <Label isCompact color="grey">Unmanaged</Label>}
                            </Td>
                            <Td dataLabel="Addresses">
                                {network.config["ipv4.address"] !== undefined && (
                                    <div>{network.config["ipv4.address"]}</div>
                                )}
                                {network.config["ipv6.address"] !== undefined && (
                                    <div>{network.config["ipv6.address"]}</div>
                                )}
                                {network.config["ipv4.address"] === undefined &&
                                    network.config["ipv6.address"] === undefined && (
                                    <span className="lxc-muted">None</span>
                                )}
                            </Td>
                            <Td dataLabel="Used by">{network.usedBy.length}</Td>
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
        return <Spinner aria-label="Loading storage pools" />;

    return (
        <div className="lxc-resource">
            {error !== null && <Alert variant="danger" isInline title={error} />}
            <Table aria-label="Storage pools" variant="compact">
                <Thead>
                    <Tr>
                        <Th modifier="nowrap">Name</Th>
                        <Th modifier="nowrap">Driver</Th>
                        <Th>Source</Th>
                        <Th modifier="nowrap">Used by</Th>
                    </Tr>
                </Thead>
                <Tbody>
                    {pools.map((pool) => (
                        <Tr key={pool.name}>
                            <Td dataLabel="Name"><strong>{pool.name}</strong></Td>
                            <Td dataLabel="Driver">{pool.driver}</Td>
                            <Td dataLabel="Source">
                                <code>{pool.config["source"] ?? ""}</code>
                            </Td>
                            <Td dataLabel="Used by">{pool.usedBy.length}</Td>
                        </Tr>
                    ))}
                </Tbody>
            </Table>
        </div>
    );
};
