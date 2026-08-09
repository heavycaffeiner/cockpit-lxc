import {
    Alert,
    Button,
    Checkbox,
    Form,
    FormGroup,
    FormHelperText,
    FormSelect,
    FormSelectOption,
    HelperText,
    HelperTextItem,
    Modal,
    ModalBody,
    ModalFooter,
    ModalHeader,
    Spinner,
    TextInput,
} from "@patternfly/react-core";
import { useEffect, useState } from "react";

import {
    T,
    format,
    type Container,
    type ContainerDriver,
    type Image,
    type StoragePool,
} from "../backend";
import { stateName } from "../components/container-state-label";

const errorText = (error: unknown): string =>
    error instanceof Error ? error.message : String(error);

interface DeleteDialogProps {
    container: Container;
    onClose: () => void;
    onConfirm: () => Promise<void>;
}

/**
 * Delete confirmation.
 *
 * Deleting a container destroys its root filesystem and Incus does not recover
 * it, so the name has to be typed. This follows Cockpit's own pattern for
 * irreversible actions, and the point is not ceremony: it makes it impossible to
 * delete the wrong row by muscle memory.
 */
export const DeleteDialog = ({ container, onClose, onConfirm }: DeleteDialogProps) => {
    const [typed, setTyped] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const matches = typed === container.name;

    const run = async () => {
        setBusy(true);
        setError(null);
        try {
            await onConfirm();
            onClose();
        } catch (caught) {
            setError(errorText(caught));
        } finally {
            setBusy(false);
        }
    };

    return (
        <Modal isOpen variant="small" onClose={onClose} aria-label={T.dialogs.delete_container}>
            <ModalHeader title={format(T.dialogs.delete, container.name)} titleIconVariant="danger" />
            <ModalBody>
                <Form onSubmit={(event) => { event.preventDefault(); if (matches) void run(); }}>
                    <p>
                        {T.dialogs.this_permanently_destroys_the_container_s}
                    </p>
                    {container.state !== "Stopped" && (
                        <Alert
                            variant="warning"
                            isInline
                            title={format(T.dialogs.is_stop_it_first, container.name, stateName(container.state).toLowerCase())}
                        />
                    )}
                    {error !== null && <Alert variant="danger" isInline title={error} />}
                    <FormGroup
                        label={format(T.dialogs.type_to_confirm, container.name)}
                        fieldId="lxc-delete-confirm"
                        isRequired
                    >
                        <TextInput
                            id="lxc-delete-confirm"
                            value={typed}
                            onChange={(_event, value) => setTyped(value)}
                            aria-label={T.dialogs.container_name_confirmation}
                            autoComplete="off"
                        />
                        <FormHelperText>
                            <HelperText>
                                <HelperTextItem variant={matches ? "success" : "default"}>
                                    {matches ? T.dialogs.names_match : T.dialogs.the_names_must_match_exactly}
                                </HelperTextItem>
                            </HelperText>
                        </FormHelperText>
                    </FormGroup>
                </Form>
            </ModalBody>
            <ModalFooter>
                <Button
                    variant="danger"
                    isDisabled={!matches || busy || container.state !== "Stopped"}
                    isLoading={busy}
                    onClick={() => void run()}
                >
                    {T.common.delete}
                </Button>
                <Button variant="link" onClick={onClose} isDisabled={busy}>
                    {T.common.cancel}
                </Button>
            </ModalFooter>
        </Modal>
    );
};

interface RenameDialogProps {
    container: Container;
    onClose: () => void;
    onConfirm: (newName: string) => Promise<void>;
}

export const RenameDialog = ({ container, onClose, onConfirm }: RenameDialogProps) => {
    const [name, setName] = useState(container.name);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const valid = name !== "" && name !== container.name && /^[a-zA-Z0-9-]+$/.test(name);

    const run = async () => {
        setBusy(true);
        setError(null);
        try {
            await onConfirm(name);
            onClose();
        } catch (caught) {
            setError(errorText(caught));
        } finally {
            setBusy(false);
        }
    };

    return (
        <Modal isOpen variant="small" onClose={onClose} aria-label={T.dialogs.rename_container}>
            <ModalHeader title={format(T.dialogs.rename, container.name)} />
            <ModalBody>
                <Form onSubmit={(event) => { event.preventDefault(); if (valid) void run(); }}>
                    {container.state !== "Stopped" && (
                        <Alert
                            variant="warning"
                            isInline
                            title={T.dialogs.incus_only_renames_a_stopped_container}
                        />
                    )}
                    {error !== null && <Alert variant="danger" isInline title={error} />}
                    <FormGroup label={T.dialogs.new_name} fieldId="lxc-rename" isRequired>
                        <TextInput
                            id="lxc-rename"
                            value={name}
                            onChange={(_event, value) => setName(value)}
                            aria-label={T.dialogs.new_container_name}
                            autoComplete="off"
                        />
                        <FormHelperText>
                            <HelperText>
                                <HelperTextItem>
                                    {T.dialogs.letters_digits_and_hyphens_only}
                                </HelperTextItem>
                            </HelperText>
                        </FormHelperText>
                    </FormGroup>
                </Form>
            </ModalBody>
            <ModalFooter>
                <Button variant="primary" isDisabled={!valid || busy} isLoading={busy}
                    onClick={() => void run()}>
                    {T.common.rename}
                </Button>
                <Button variant="link" onClick={onClose} isDisabled={busy}>{T.common.cancel}</Button>
            </ModalFooter>
        </Modal>
    );
};

interface CopyDialogProps {
    container: Container;
    existing: readonly string[];
    onClose: () => void;
    onConfirm: (newName: string) => Promise<void>;
}

export const CopyDialog = ({ container, existing, onClose, onConfirm }: CopyDialogProps) => {
    const [name, setName] = useState(`${container.name}-copy`);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const duplicate = existing.includes(name);
    const valid = name !== "" && /^[a-zA-Z0-9-]+$/.test(name) && !duplicate;

    const run = async () => {
        setBusy(true);
        setError(null);
        try {
            await onConfirm(name);
            onClose();
        } catch (caught) {
            setError(errorText(caught));
        } finally {
            setBusy(false);
        }
    };

    return (
        <Modal isOpen variant="small" onClose={onClose} aria-label={T.dialogs.copy_container}>
            <ModalHeader title={format(T.dialogs.copy, container.name)} />
            <ModalBody>
                <Form onSubmit={(event) => { event.preventDefault(); if (valid) void run(); }}>
                    <p>
                        {T.dialogs.the_copy_takes_this_container_s}
                    </p>
                    {error !== null && <Alert variant="danger" isInline title={error} />}
                    <FormGroup label={T.dialogs.name_for_the_copy} fieldId="lxc-copy-name" isRequired>
                        <TextInput
                            id="lxc-copy-name"
                            value={name}
                            onChange={(_event, value) => setName(value)}
                            validated={name === "" ? "default" : valid ? "success" : "error"}
                            aria-label={T.dialogs.name_for_the_copy}
                            autoComplete="off"
                        />
                        <FormHelperText>
                            <HelperText>
                                <HelperTextItem variant={duplicate ? "error" : "default"}>
                                    {duplicate
                                        ? T.dialogs.a_container_with_that_name_already
                                        : T.dialogs.letters_digits_and_hyphens_only}
                                </HelperTextItem>
                            </HelperText>
                        </FormHelperText>
                    </FormGroup>
                </Form>
            </ModalBody>
            <ModalFooter>
                <Button variant="primary" isDisabled={!valid || busy} isLoading={busy}
                    onClick={() => void run()}>
                    {T.actions.copy}
                </Button>
                <Button variant="link" onClick={onClose} isDisabled={busy}>{T.common.cancel}</Button>
            </ModalFooter>
        </Modal>
    );
};

export interface CreateSpec {
    name: string;
    /** A local image, named by alias where it has one, else by fingerprint. */
    image: string;
    start: boolean;
    /** The pool the root disk goes on. Empty leaves the profile's choice. */
    pool: string;
}

interface CreateDialogProps {
    existing: readonly string[];
    driver: ContainerDriver;
    /** Sends the operator to the Images page when nothing is cached. */
    onBrowseImages: () => void;
    onClose: () => void;
    onConfirm: (spec: CreateSpec) => Promise<void>;
}

/**
 * How an image reads in the picker.
 *
 * The alias first, because that is what an operator recognises. An image pulled
 * without one has only a 64-character fingerprint, so the description carries
 * the recognition and the fingerprint is shortened to the part that
 * distinguishes it.
 */
const imageLabel = (image: Image): string => {
    const alias = image.aliases[0];
    const detail = image.description === "" ? image.architecture : image.description;
    return alias === undefined
        ? `${detail} (${image.fingerprint.slice(0, 12)})`
        : `${alias} (${detail})`;
};

/** What identifies the image to Incus: the alias if it has one, else the hash. */
const imageValue = (image: Image): string => image.aliases[0] ?? image.fingerprint;

/**
 * Create a container from an image already on this host.
 *
 * The image is picked from what is cached rather than typed. A typed alias is
 * checked only by Incus, minutes into a download, and its failure does not
 * distinguish a misspelling from a remote that does not carry it. Downloading
 * is a separate step with its own tab, so the two failures stay separate too.
 */
export const CreateDialog = ({
    existing,
    driver,
    onBrowseImages,
    onClose,
    onConfirm,
}: CreateDialogProps) => {
    const [name, setName] = useState("");
    const [image, setImage] = useState("");
    const [images, setImages] = useState<readonly Image[] | null>(null);
    const [pools, setPools] = useState<readonly StoragePool[]>([]);
    const [pool, setPool] = useState("");
    const [start, setStart] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        driver.listImages().then(
            (result) => {
                if (cancelled)
                    return;
                setImages(result);
                setImage(result[0] === undefined ? "" : imageValue(result[0]));
            },
            (caught: unknown) => {
                if (!cancelled) {
                    setImages([]);
                    setError(errorText(caught));
                }
            },
        );
        return () => { cancelled = true; };
    }, [driver]);

    /*
     * Pools are loaded separately and their failure is swallowed. The choice is
     * optional and the default is the one Incus would have made, so a host whose
     * pools cannot be read should still be able to create a container rather
     * than see the dialog fail over a field nobody had to fill in.
     */
    useEffect(() => {
        let cancelled = false;
        driver.listStoragePools().then(
            (result) => { if (!cancelled) setPools(result); },
            () => { if (!cancelled) setPools([]); },
        );
        return () => { cancelled = true; };
    }, [driver]);

    const duplicate = existing.includes(name);
    const nameValid = name !== "" && /^[a-zA-Z0-9-]+$/.test(name) && !duplicate;
    const valid = nameValid && image !== "";

    const run = async () => {
        setBusy(true);
        setError(null);
        try {
            await onConfirm({ name, image, start, pool });
            onClose();
        } catch (caught) {
            setError(errorText(caught));
        } finally {
            setBusy(false);
        }
    };

    const empty = images !== null && images.length === 0;

    return (
        <Modal isOpen variant="medium" onClose={onClose} aria-label={T.list.create_container}>
            <ModalHeader title={T.list.create_container} />
            <ModalBody>
                <Form onSubmit={(event) => { event.preventDefault(); if (valid) void run(); }}>
                    {error !== null && <Alert variant="danger" isInline title={error} />}
                    <FormGroup label={T.common.name} fieldId="lxc-create-name" isRequired>
                        <TextInput
                            id="lxc-create-name"
                            value={name}
                            onChange={(_event, value) => setName(value)}
                            validated={name === "" ? "default" : nameValid ? "success" : "error"}
                            aria-label={T.dialogs.container_name}
                            autoComplete="off"
                        />
                        <FormHelperText>
                            <HelperText>
                                <HelperTextItem variant={duplicate ? "error" : "default"}>
                                    {duplicate
                                        ? T.dialogs.a_container_with_that_name_already
                                        : T.dialogs.letters_digits_and_hyphens_only}
                                </HelperTextItem>
                            </HelperText>
                        </FormHelperText>
                    </FormGroup>
                    <FormGroup label={T.common.image} fieldId="lxc-create-image" isRequired>
                        {images === null
                            ? <Spinner size="md" aria-label={T.images.loading_images} />
                            : empty
                                ? (
                                    <Alert
                                        variant="info"
                                        isInline
                                        title={T.dialogs.no_image_is_cached_on_this}
                                    >
                                        <Button variant="link" isInline onClick={onBrowseImages}>
                                            {T.dialogs.go_to_images}
                                        </Button>
                                    </Alert>
                                )
                                : (
                                    <>
                                        <FormSelect
                                            id="lxc-create-image"
                                            value={image}
                                            onChange={(_event, value) => setImage(value)}
                                            aria-label={T.common.image}
                                        >
                                            {images.map((candidate) => (
                                                <FormSelectOption
                                                    key={candidate.fingerprint}
                                                    value={imageValue(candidate)}
                                                    label={imageLabel(candidate)}
                                                />
                                            ))}
                                        </FormSelect>
                                        <FormHelperText>
                                            <HelperText>
                                                <HelperTextItem>
                                                    {T.dialogs.pick_from_the_images_cached_on}
                                                </HelperTextItem>
                                            </HelperText>
                                        </FormHelperText>
                                    </>
                                )}
                    </FormGroup>
                    {/*
                      * Only when there is a choice to make. One pool means the
                      * select would have a single option beside the default that
                      * resolves to it, which is a control that cannot change
                      * anything.
                      */}
                    {pools.length > 1 && (
                        <FormGroup label={T.common.storage_pool} fieldId="lxc-create-pool">
                            <FormSelect
                                id="lxc-create-pool"
                                value={pool}
                                onChange={(_event, value) => setPool(value)}
                                aria-label={T.common.storage_pool}
                            >
                                <FormSelectOption value="" label={T.dialogs.the_profiles_pool} />
                                {pools.map((candidate) => (
                                    <FormSelectOption
                                        key={candidate.name}
                                        value={candidate.name}
                                        label={`${candidate.name} (${candidate.driver})`}
                                    />
                                ))}
                            </FormSelect>
                            <FormHelperText>
                                <HelperText>
                                    <HelperTextItem>
                                        {T.dialogs.the_root_disk_is_created_here}
                                    </HelperTextItem>
                                </HelperText>
                            </FormHelperText>
                        </FormGroup>
                    )}
                    <FormGroup fieldId="lxc-create-start">
                        <Checkbox
                            id="lxc-create-start"
                            label={T.dialogs.start_the_container_once_it_is}
                            isChecked={start}
                            onChange={(_event, checked) => setStart(checked)}
                        />
                    </FormGroup>
                </Form>
            </ModalBody>
            <ModalFooter>
                <Button variant="primary" isDisabled={!valid || busy} isLoading={busy}
                    onClick={() => void run()}>
                    {T.common.create}
                </Button>
                <Button variant="link" onClick={onClose} isDisabled={busy}>{T.common.cancel}</Button>
            </ModalFooter>
        </Modal>
    );
};
