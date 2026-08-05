import {
    Alert,
    Button,
    Checkbox,
    Form,
    FormGroup,
    FormHelperText,
    HelperText,
    HelperTextItem,
    Modal,
    ModalBody,
    ModalFooter,
    ModalHeader,
    TextInput,
} from "@patternfly/react-core";
import { useState } from "react";

import {
    T,
    format,
    type Container,
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
    image: string;
    remote: string;
    start: boolean;
}

interface CreateDialogProps {
    existing: readonly string[];
    onClose: () => void;
    onConfirm: (spec: CreateSpec) => Promise<void>;
}

export const CreateDialog = ({ existing, onClose, onConfirm }: CreateDialogProps) => {
    const [name, setName] = useState("");
    const [image, setImage] = useState("images:debian/12");
    const [start, setStart] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const duplicate = existing.includes(name);
    const nameValid = name !== "" && /^[a-zA-Z0-9-]+$/.test(name) && !duplicate;
    const valid = nameValid && image.trim() !== "";

    const run = async () => {
        setBusy(true);
        setError(null);
        // "images:debian/12" splits into the remote and the alias; a bare alias
        // means an image already on this host.
        const separator = image.indexOf(":");
        const remote = separator === -1 ? "local" : image.slice(0, separator);
        const alias = separator === -1 ? image : image.slice(separator + 1);
        try {
            await onConfirm({ name, image: alias, remote, start });
            onClose();
        } catch (caught) {
            setError(errorText(caught));
        } finally {
            setBusy(false);
        }
    };

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
                        <TextInput
                            id="lxc-create-image"
                            value={image}
                            onChange={(_event, value) => setImage(value)}
                            aria-label={T.dialogs.image_alias}
                            autoComplete="off"
                        />
                        <FormHelperText>
                            <HelperText>
                                <HelperTextItem>
                                    An alias such as <code>images:debian/12</code>. A name with
                                    no remote refers to an image already on this host.
                                </HelperTextItem>
                            </HelperText>
                        </FormHelperText>
                    </FormGroup>
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
