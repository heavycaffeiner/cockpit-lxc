import {
    Alert,
    Button,
    Form,
    FormGroup,
    FormHelperText,
    FormSelect,
    FormSelectOption,
    HelperText,
    HelperTextItem,
    Label,
    Modal,
    ModalBody,
    ModalFooter,
    ModalHeader,
    Progress,
    SearchInput,
    Spinner,
    Tab,
    TabTitleText,
    Tabs,
    TextInput,
    Tooltip,
} from "@patternfly/react-core";
import { SyncAltIcon } from "@patternfly/react-icons";
import { Table, Tbody, Td, Th, Thead, Tr } from "@patternfly/react-table";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
    T,
    format,
    type ContainerDriver,
    type Image,
    type Remote,
    type RemoteImage,
    type StorageVolume,
} from "../backend";
import { announce } from "../components/live-region";
import { ConfirmDelete } from "../components/resource-dialog";
import { useResourceList } from "../hooks/use-resource-list";

const errorText = (error: unknown): string =>
    error instanceof Error ? error.message : String(error);

export const formatBytes = (bytes: number): string => {
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

/**
 * The percentage out of Incus's progress line.
 *
 * The line reads like "rootfs: 43% (4.21MB/s)". Only the number is wanted; the
 * whole line is shown as the label, so a format change degrades to a bar with no
 * fill rather than to a wrong one.
 */
const progressPercent = (text: string): number => {
    const match = /(\d+(?:\.\d+)?)\s*%/.exec(text);
    return match === null ? 0 : Math.min(100, Number(match[1]));
};

type ImageTab = "local" | "download";

interface ImagesViewProps {
    driver: ContainerDriver;
    /** Refreshes the container list, whose create dialog offers these images. */
    onChanged: () => void;
}

/**
 * Images, split by what the operator is doing.
 *
 * Downloading is browsing a remote catalogue over the network and can take
 * minutes; the local list is a handful of rows that answers "what can I create
 * from". Putting the catalogue in a modal over the local list made the slow,
 * exploratory half interrupt the quick one, so each gets its own tab.
 */
export const ImagesView = ({ driver, onChanged }: ImagesViewProps) => {
    const load = useCallback(() => driver.listImages(), [driver]);
    const local = useResourceList<Image>(load);
    const [tab, setTab] = useState<ImageTab>("local");
    const [progress, setProgress] = useState<string | null>(null);

    const pull = (alias: string, remote: string) =>
        local.run(async () => {
            try {
                await driver.pullImage(alias, remote, setProgress);
                announce(format(T.images.downloaded, alias));
                onChanged();
                // The point of downloading is to have it locally, so this ends
                // where the operator was heading anyway.
                setTab("local");
            } finally {
                setProgress(null);
            }
        });

    return (
        <div className="lxc-resource">
            {local.error !== null && <Alert variant="danger" isInline title={local.error} />}

            {/*
              * The bar lives above the tabs rather than inside the download
              * one: a pull keeps running when the operator switches back to the
              * local list, and progress that disappears reads as a stall.
              */}
            {progress !== null && (
                <Progress
                    value={progressPercent(progress)}
                    title={T.images.downloading}
                    label={progress}
                    aria-label={T.images.download_progress}
                    className="lxc-pull-progress"
                />
            )}

            <Tabs
                activeKey={tab}
                onSelect={(_event, key) => setTab(key as ImageTab)}
                aria-label={T.images.image_views}
                // Subtab styling, so this reads as a level below the page tabs
                // rather than as a second set of them.
                isSubtab
                role="region"
            >
                <Tab eventKey="local" title={<TabTitleText>{T.images.local_images}</TabTitleText>}>
                    {tab === "local" && (
                        <LocalImages driver={driver} list={local} onGetImages={() => setTab("download")} />
                    )}
                </Tab>
                <Tab eventKey="download" title={<TabTitleText>{T.images.pull_image}</TabTitleText>}>
                    {tab === "download" && (
                        <DownloadImages driver={driver} busy={local.busy} onPull={pull} />
                    )}
                </Tab>
            </Tabs>
        </div>
    );
};

/**
 * Where the tarballs land.
 *
 * Incus keeps its image store in a directory under /var/lib/incus unless
 * `storage.images_volume` names a custom volume to use instead, which is the
 * setting that lets a host with a small root filesystem cache images somewhere
 * with room for them.
 *
 * A picker rather than a text field: the value is "pool/volume" and Incus
 * rejects anything that is not an existing filesystem volume, so the choices
 * are exactly the volumes that exist and a typo is not a way to fail.
 */
const ImageStore = ({ driver }: { driver: ContainerDriver }) => {
    const [volumes, setVolumes] = useState<readonly StorageVolume[] | null>(null);
    // The value the server holds, kept apart from the pending selection so the
    // button knows whether there is anything to save.
    const [saved, setSaved] = useState<string | null>(null);
    const [chosen, setChosen] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        Promise.all([driver.getImagesVolume(), driver.listCustomVolumes()]).then(
            ([current, available]) => {
                if (cancelled)
                    return;
                setSaved(current);
                setChosen(current);
                setVolumes(available);
            },
            /*
             * Nothing is assumed about the current value here. Defaulting it to
             * "the Incus directory" would render the picker showing a setting
             * the server was never asked about, and the next save would write
             * that guess over whatever is really set.
             */
            (caught: unknown) => {
                if (!cancelled)
                    setError(errorText(caught));
            },
        );
        return () => { cancelled = true; };
    }, [driver]);

    const save = async () => {
        setBusy(true);
        setError(null);
        try {
            await driver.setImagesVolume(chosen);
            setSaved(chosen);
            announce(chosen === ""
                ? T.images.the_image_store_is_back_in
                : format(T.images.the_image_store_is_now_on, chosen));
        } catch (caught) {
            setError(errorText(caught));
        } finally {
            setBusy(false);
        }
    };

    // The read failed, so there is no setting to show. The reason is, and it is
    // the only thing this can honestly report.
    if (volumes === null || saved === null)
        return error === null ? null : <Alert variant="danger" isInline title={error} />;

    /*
     * The current value is offered even when it is not in the list. Incus keeps
     * whatever was set, and a volume this cannot see, deleted, or on a pool that
     * failed to read, must not silently show as the default and then be written
     * away by the next save.
     */
    const known = volumes.some((volume) => `${volume.pool}/${volume.name}` === saved);
    const missing = saved !== "" && !known;

    return (
        <div className="lxc-imagestore">
            {error !== null && <Alert variant="danger" isInline title={error} />}

            <FormGroup label={T.images.image_store_location} fieldId="lxc-images-volume">
                <div className="lxc-imagestore__row">
                    <div className="lxc-imagestore__picker">
                        <FormSelect
                            id="lxc-images-volume"
                            value={chosen}
                            onChange={(_event, value) => setChosen(value)}
                            aria-label={T.images.image_store_location}
                            isDisabled={busy}
                        >
                            <FormSelectOption value="" label={T.images.the_incus_data_directory} />
                            {missing && <FormSelectOption value={saved} label={saved} />}
                            {volumes.map((volume) => {
                                const value = `${volume.pool}/${volume.name}`;
                                return <FormSelectOption key={value} value={value} label={value} />;
                            })}
                        </FormSelect>
                    </div>
                    <Button
                        variant="secondary"
                        isDisabled={busy || chosen === saved}
                        isLoading={busy}
                        onClick={() => void save()}
                    >
                        {T.common.save}
                    </Button>
                </div>
                <FormHelperText>
                    <HelperText>
                        <HelperTextItem variant={chosen === saved ? "default" : "warning"}>
                            {volumes.length === 0 && saved === ""
                                ? T.images.no_custom_volume_exists_to_move
                                : T.images.incus_moves_the_images_it_already}
                        </HelperTextItem>
                    </HelperText>
                </FormHelperText>
            </FormGroup>
        </div>
    );
};

const LocalImages = ({
    driver,
    list,
    onGetImages,
}: {
    driver: ContainerDriver;
    list: ReturnType<typeof useResourceList<Image>>;
    onGetImages: () => void;
}) => {
    const { items, busy, reload, run } = list;
    const [aliasing, setAliasing] = useState<Image | null>(null);
    const [deleting, setDeleting] = useState<Image | null>(null);

    if (items === null)
        return <Spinner aria-label={T.images.loading_images} />;

    return (
        <>
            <div className="lxc-page__toolbar">
                <Button variant="secondary" icon={<SyncAltIcon />} onClick={reload} isDisabled={busy}>
                    {T.common.refresh}
                </Button>
            </div>

            <ImageStore driver={driver} />

            {items.length === 0
                ? (
                    <p className="lxc-muted">
                        {T.images.no_images_are_cached_on_this}{" "}
                        <Button variant="link" isInline onClick={onGetImages}>
                            {T.images.download_one}
                        </Button>
                    </p>
                )
                : (
                    <Table aria-label={T.images.local_images} variant="compact">
                        <Thead>
                            <Tr>
                                <Th modifier="nowrap">{T.common.name}</Th>
                                <Th modifier="nowrap">{T.images.fingerprint}</Th>
                                <Th modifier="nowrap">{T.common.architecture}</Th>
                                <Th modifier="nowrap">{T.common.size}</Th>
                                <Th modifier="nowrap">{T.images.added}</Th>
                                <Th screenReaderText={T.common.actions} />
                            </Tr>
                        </Thead>
                        <Tbody>
                            {items.map((image) => (
                                <Tr key={image.fingerprint}>
                                    <Td dataLabel={T.common.name}>
                                        {image.aliases.length > 0
                                            ? image.aliases.map((alias) => (
                                                <Label key={alias} isCompact color="blue"
                                                    onClose={() => void run(() =>
                                                        driver.deleteImageAlias(alias))}
                                                    closeBtnAriaLabel={format(T.images.remove_alias, alias)}>
                                                    {alias}
                                                </Label>
                                            ))
                                            : <span className="lxc-muted">{T.images.no_alias}</span>}
                                        <div className="lxc-row__description">{image.description}</div>
                                    </Td>
                                    <Td dataLabel={T.images.fingerprint}>
                                        <Tooltip content={image.fingerprint}>
                                            <code>{image.fingerprint.slice(0, 12)}</code>
                                        </Tooltip>
                                    </Td>
                                    <Td dataLabel={T.common.architecture}>{image.architecture}</Td>
                                    <Td dataLabel={T.common.size}>{formatBytes(image.size)}</Td>
                                    <Td dataLabel={T.images.added}>{formatTime(image.uploadedAt)}</Td>
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
                                                {T.images.add_alias}
                                            </Button>
                                            <Button variant="link" isDanger isDisabled={busy}
                                                onClick={() => setDeleting(image)}>
                                                {T.common.delete}
                                            </Button>
                                        </div>
                                    </Td>
                                </Tr>
                            ))}
                        </Tbody>
                    </Table>
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
                <ConfirmDelete
                    title={T.images.delete_this_image}
                    body={format(
                        T.images.is_removed_from_this_host_containers,
                        deleting.description || deleting.fingerprint.slice(0, 12),
                    )}
                    blocker={null}
                    onClose={() => setDeleting(null)}
                    onConfirm={() => run(() => driver.deleteImage(deleting.fingerprint))}
                />
            )}
        </>
    );
};

/**
 * A remote's catalogue, browsed rather than typed.
 *
 * A typed alias is checked only by Incus, minutes into a download, and the
 * failure does not distinguish a misspelling from a remote that does not carry
 * that image.
 */
const DownloadImages = ({
    driver,
    busy,
    onPull,
}: {
    driver: ContainerDriver;
    busy: boolean;
    onPull: (alias: string, remote: string) => Promise<void>;
}) => {
    const [remotes, setRemotes] = useState<Remote[] | null>(null);
    const [remote, setRemote] = useState("");
    const [search, setSearch] = useState("");
    const [error, setError] = useState<string | null>(null);

    /*
     * The catalogue is stored with the remote it came from, so switching
     * remotes derives "still loading" from a mismatch rather than clearing
     * state from inside an effect and paying for the extra render.
     */
    const [loaded, setLoaded] = useState<{ remote: string; images: RemoteImage[] } | null>(null);
    const images = loaded?.remote === remote ? loaded.images : null;

    useEffect(() => {
        let cancelled = false;
        driver.listRemotes().then(
            (result) => {
                if (cancelled)
                    return;
                const usable = result.filter((entry) => !entry.isLocal);
                setRemotes(usable);
                setRemote(usable[0]?.name ?? "");
            },
            (caught: unknown) => {
                if (!cancelled) {
                    setRemotes([]);
                    setError(errorText(caught));
                }
            },
        );
        return () => { cancelled = true; };
    }, [driver]);

    useEffect(() => {
        if (remote === "")
            return;
        let cancelled = false;
        driver.listRemoteImages(remote).then(
            (result) => {
                if (!cancelled) {
                    setLoaded({ remote, images: result });
                    setError(null);
                }
            },
            (caught: unknown) => {
                if (!cancelled) {
                    setLoaded({ remote, images: [] });
                    setError(errorText(caught));
                }
            },
        );
        return () => { cancelled = true; };
    }, [driver, remote]);

    const visible = useMemo(() => {
        const needle = search.trim().toLowerCase();
        // Virtual machine images cannot become system containers, and offering
        // one produces a create that fails on a mismatch nobody chose.
        const all = (images ?? []).filter((image) => image.type !== "virtual-machine");
        if (needle === "")
            return all;
        return all.filter((image) =>
            image.alias.toLowerCase().includes(needle) ||
            image.description.toLowerCase().includes(needle));
    }, [images, search]);

    return (
        <>
            {error !== null && <Alert variant="danger" isInline title={error} />}

            <div className="lxc-page__toolbar">
                <div className="lxc-remote-picker">
                    <FormSelect
                        id="lxc-pull-remote"
                        value={remote}
                        onChange={(_event, value) => setRemote(value)}
                        aria-label={T.images.remote}
                        isDisabled={remotes === null || remotes.length === 0}
                    >
                        {(remotes ?? []).map((entry) => (
                            <FormSelectOption key={entry.name} value={entry.name}
                                label={`${entry.name} (${entry.address})`} />
                        ))}
                    </FormSelect>
                </div>
                <div className="lxc-search">
                    <SearchInput
                        id="lxc-pull-search"
                        aria-label={T.images.filter_the_catalogue}
                        placeholder={T.images.filter}
                        value={search}
                        onChange={(_event, value) => setSearch(value)}
                        onClear={() => setSearch("")}
                    />
                </div>
                {images !== null && (
                    <span className="lxc-count">
                        {format(T.images.of_images, visible.length, images.length)}
                    </span>
                )}
            </div>

            {remotes !== null && remotes.length === 0
                ? <p className="lxc-muted">{T.images.no_image_remote_is_configured_on}</p>
                : images === null
                    ? <Spinner aria-label={T.images.loading_the_catalogue} />
                    : (
                        <div className="lxc-catalogue">
                            <Table aria-label={T.images.remote_images} variant="compact">
                                <Thead>
                                    <Tr>
                                        <Th modifier="nowrap">{T.images.alias}</Th>
                                        <Th>{T.common.description}</Th>
                                        <Th modifier="nowrap">{T.common.architecture}</Th>
                                        <Th modifier="nowrap">{T.common.size}</Th>
                                        <Th screenReaderText={T.common.actions} />
                                    </Tr>
                                </Thead>
                                <Tbody>
                                    {visible.map((image) => (
                                        <Tr key={image.alias}>
                                            <Td dataLabel={T.images.alias}><code>{image.alias}</code></Td>
                                            <Td dataLabel={T.common.description}>{image.description}</Td>
                                            <Td dataLabel={T.common.architecture}>{image.architecture}</Td>
                                            <Td dataLabel={T.common.size}>{formatBytes(image.size)}</Td>
                                            <Td isActionCell modifier="nowrap">
                                                <Button
                                                    variant="secondary"
                                                    isDisabled={busy}
                                                    onClick={() => void onPull(image.alias, remote)}
                                                >
                                                    {T.images.pull}
                                                </Button>
                                            </Td>
                                        </Tr>
                                    ))}
                                    {visible.length === 0 && (
                                        <Tr>
                                            <Td colSpan={5}>
                                                <span className="lxc-muted">
                                                    {T.images.no_image_matches_the_filter}
                                                </span>
                                            </Td>
                                        </Tr>
                                    )}
                                </Tbody>
                            </Table>
                        </div>
                    )}
        </>
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
        <Modal isOpen variant="small" onClose={onClose} aria-label={T.images.add_image_alias}>
            <ModalHeader title={T.images.name_this_image} />
            <ModalBody>
                <Form onSubmit={(event) => event.preventDefault()}>
                    <FormGroup label={T.images.alias} fieldId="lxc-alias-name" isRequired>
                        <TextInput id="lxc-alias-name" value={alias}
                            onChange={(_event, next) => setAlias(next)}
                            aria-label={T.images.alias} autoComplete="off" />
                    </FormGroup>
                    <FormGroup label={T.common.description} fieldId="lxc-alias-desc">
                        <TextInput id="lxc-alias-desc" value={description}
                            onChange={(_event, next) => setDescription(next)}
                            aria-label={T.common.description} />
                    </FormGroup>
                </Form>
            </ModalBody>
            <ModalFooter>
                <Button variant="primary" isDisabled={!valid} onClick={() => {
                    void onConfirm(alias.trim(), description);
                    onClose();
                }}>
                    {T.images.add_alias}
                </Button>
                <Button variant="link" onClick={onClose}>{T.common.cancel}</Button>
            </ModalFooter>
        </Modal>
    );
};
