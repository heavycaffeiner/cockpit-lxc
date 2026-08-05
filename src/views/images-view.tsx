import {
    Alert,
    Button,
    Form,
    FormGroup,
    FormSelect,
    FormSelectOption,
    Label,
    Modal,
    ModalBody,
    ModalFooter,
    ModalHeader,
    Progress,
    SearchInput,
    Spinner,
    TextInput,
    Tooltip,
} from "@patternfly/react-core";
import { DownloadIcon, SyncAltIcon } from "@patternfly/react-icons";
import { Table, Tbody, Td, Th, Thead, Tr } from "@patternfly/react-table";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
    T,
    format,
    type ContainerDriver,
    type Image,
    type Remote,
    type RemoteImage,
} from "../backend";
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

interface ImagesViewProps {
    driver: ContainerDriver;
    /** Refreshes the container list, since a create dialog offers these images. */
    onChanged: () => void;
}

export const ImagesView = ({ driver, onChanged }: ImagesViewProps) => {
    const load = useCallback(() => driver.listImages(), [driver]);
    const { items, error, busy, reload, run } = useResourceList<Image>(load);

    const [pulling, setPulling] = useState(false);
    const [progress, setProgress] = useState<string | null>(null);
    const [aliasing, setAliasing] = useState<Image | null>(null);
    const [deleting, setDeleting] = useState<Image | null>(null);

    const pull = (alias: string, remote: string) =>
        run(async () => {
            try {
                await driver.pullImage(alias, remote, setProgress);
                onChanged();
            } finally {
                setProgress(null);
            }
        });

    if (items === null)
        return <Spinner aria-label={T.images.loading_images} />;

    return (
        <div className="lxc-resource">
            {error !== null && <Alert variant="danger" isInline title={error} />}

            {progress !== null && (
                <Progress
                    value={progressPercent(progress)}
                    title={T.images.downloading}
                    label={progress}
                    aria-label={T.images.download_progress}
                    className="lxc-pull-progress"
                />
            )}

            <div className="lxc-page__toolbar">
                <Button variant="primary" icon={<DownloadIcon />} isDisabled={busy}
                    onClick={() => setPulling(true)}>
                    {T.images.pull_image}
                </Button>
                <Button variant="secondary" icon={<SyncAltIcon />} onClick={reload} isDisabled={busy}>
                    {T.common.refresh}
                </Button>
            </div>

            {items.length === 0
                ? <p className="lxc-muted">{T.images.no_images_are_cached_on_this}</p>
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

            {pulling && (
                <PullImageDialog
                    driver={driver}
                    onClose={() => setPulling(false)}
                    onConfirm={pull}
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
        </div>
    );
};

/**
 * Pick an image from a remote's catalogue.
 *
 * Browsing rather than typing an alias: an alias that does not exist fails
 * minutes later at the end of a download attempt, and there is no way to guess
 * from the failure whether the name or the remote was wrong.
 */
const PullImageDialog = ({
    driver,
    onClose,
    onConfirm,
}: {
    driver: ContainerDriver;
    onClose: () => void;
    onConfirm: (alias: string, remote: string) => Promise<void>;
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
        const all = (images ?? []).filter((image) => image.type !== "virtual-machine");
        if (needle === "")
            return all;
        return all.filter((image) =>
            image.alias.toLowerCase().includes(needle) ||
            image.description.toLowerCase().includes(needle));
    }, [images, search]);

    return (
        <Modal isOpen variant="large" onClose={onClose} aria-label={T.images.pull_image}>
            <ModalHeader title={T.images.pull_an_image} />
            <ModalBody>
                {error !== null && <Alert variant="danger" isInline title={error} />}

                <Form onSubmit={(event) => event.preventDefault()}>
                    <FormGroup label={T.images.remote} fieldId="lxc-pull-remote">
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
                    </FormGroup>

                    <FormGroup label={T.images.filter} fieldId="lxc-pull-search">
                        <SearchInput
                            id="lxc-pull-search"
                            aria-label={T.images.filter_the_catalogue}
                            value={search}
                            onChange={(_event, value) => setSearch(value)}
                            onClear={() => setSearch("")}
                        />
                    </FormGroup>
                </Form>

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
                                                    <Button variant="secondary" onClick={() => {
                                                        void onConfirm(image.alias, remote);
                                                        onClose();
                                                    }}>
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
            </ModalBody>
            <ModalFooter>
                <Button variant="link" onClick={onClose}>{T.common.cancel}</Button>
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
