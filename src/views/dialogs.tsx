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

import type { Container } from "../backend";

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
        <Modal isOpen variant="small" onClose={onClose} aria-label="Delete container">
            <ModalHeader title={`Delete ${container.name}?`} titleIconVariant="danger" />
            <ModalBody>
                <Form onSubmit={(event) => { event.preventDefault(); if (matches) void run(); }}>
                    <p>
                        This permanently destroys the container&apos;s root filesystem and
                        every snapshot it holds. Incus cannot recover it.
                    </p>
                    {container.state !== "Stopped" && (
                        <Alert
                            variant="warning"
                            isInline
                            title={`${container.name} is ${container.state.toLowerCase()}. Stop it first.`}
                        />
                    )}
                    {error !== null && <Alert variant="danger" isInline title={error} />}
                    <FormGroup
                        label={`Type ${container.name} to confirm`}
                        fieldId="lxc-delete-confirm"
                        isRequired
                    >
                        <TextInput
                            id="lxc-delete-confirm"
                            value={typed}
                            onChange={(_event, value) => setTyped(value)}
                            aria-label="Container name confirmation"
                            autoComplete="off"
                        />
                        <FormHelperText>
                            <HelperText>
                                <HelperTextItem variant={matches ? "success" : "default"}>
                                    {matches ? "Names match" : "The names must match exactly"}
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
                    Delete
                </Button>
                <Button variant="link" onClick={onClose} isDisabled={busy}>
                    Cancel
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
        <Modal isOpen variant="small" onClose={onClose} aria-label="Rename container">
            <ModalHeader title={`Rename ${container.name}`} />
            <ModalBody>
                <Form onSubmit={(event) => { event.preventDefault(); if (valid) void run(); }}>
                    {container.state !== "Stopped" && (
                        <Alert
                            variant="warning"
                            isInline
                            title="Incus only renames a stopped container."
                        />
                    )}
                    {error !== null && <Alert variant="danger" isInline title={error} />}
                    <FormGroup label="New name" fieldId="lxc-rename" isRequired>
                        <TextInput
                            id="lxc-rename"
                            value={name}
                            onChange={(_event, value) => setName(value)}
                            aria-label="New container name"
                            autoComplete="off"
                        />
                        <FormHelperText>
                            <HelperText>
                                <HelperTextItem>
                                    Letters, digits and hyphens only.
                                </HelperTextItem>
                            </HelperText>
                        </FormHelperText>
                    </FormGroup>
                </Form>
            </ModalBody>
            <ModalFooter>
                <Button variant="primary" isDisabled={!valid || busy} isLoading={busy}
                    onClick={() => void run()}>
                    Rename
                </Button>
                <Button variant="link" onClick={onClose} isDisabled={busy}>Cancel</Button>
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
        <Modal isOpen variant="small" onClose={onClose} aria-label="Copy container">
            <ModalHeader title={`Copy ${container.name}`} />
            <ModalBody>
                <Form onSubmit={(event) => { event.preventDefault(); if (valid) void run(); }}>
                    <p>
                        The copy takes this container&apos;s configuration and its disk. It is
                        not the same as creating a new container from the same image.
                    </p>
                    {error !== null && <Alert variant="danger" isInline title={error} />}
                    <FormGroup label="Name for the copy" fieldId="lxc-copy-name" isRequired>
                        <TextInput
                            id="lxc-copy-name"
                            value={name}
                            onChange={(_event, value) => setName(value)}
                            validated={name === "" ? "default" : valid ? "success" : "error"}
                            aria-label="Name for the copy"
                            autoComplete="off"
                        />
                        <FormHelperText>
                            <HelperText>
                                <HelperTextItem variant={duplicate ? "error" : "default"}>
                                    {duplicate
                                        ? "A container with that name already exists"
                                        : "Letters, digits and hyphens only."}
                                </HelperTextItem>
                            </HelperText>
                        </FormHelperText>
                    </FormGroup>
                </Form>
            </ModalBody>
            <ModalFooter>
                <Button variant="primary" isDisabled={!valid || busy} isLoading={busy}
                    onClick={() => void run()}>
                    Copy
                </Button>
                <Button variant="link" onClick={onClose} isDisabled={busy}>Cancel</Button>
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
        <Modal isOpen variant="medium" onClose={onClose} aria-label="Create container">
            <ModalHeader title="Create container" />
            <ModalBody>
                <Form onSubmit={(event) => { event.preventDefault(); if (valid) void run(); }}>
                    {error !== null && <Alert variant="danger" isInline title={error} />}
                    <FormGroup label="Name" fieldId="lxc-create-name" isRequired>
                        <TextInput
                            id="lxc-create-name"
                            value={name}
                            onChange={(_event, value) => setName(value)}
                            validated={name === "" ? "default" : nameValid ? "success" : "error"}
                            aria-label="Container name"
                            autoComplete="off"
                        />
                        <FormHelperText>
                            <HelperText>
                                <HelperTextItem variant={duplicate ? "error" : "default"}>
                                    {duplicate
                                        ? "A container with that name already exists"
                                        : "Letters, digits and hyphens only."}
                                </HelperTextItem>
                            </HelperText>
                        </FormHelperText>
                    </FormGroup>
                    <FormGroup label="Image" fieldId="lxc-create-image" isRequired>
                        <TextInput
                            id="lxc-create-image"
                            value={image}
                            onChange={(_event, value) => setImage(value)}
                            aria-label="Image alias"
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
                            label="Start the container once it is created"
                            isChecked={start}
                            onChange={(_event, checked) => setStart(checked)}
                        />
                    </FormGroup>
                </Form>
            </ModalBody>
            <ModalFooter>
                <Button variant="primary" isDisabled={!valid || busy} isLoading={busy}
                    onClick={() => void run()}>
                    Create
                </Button>
                <Button variant="link" onClick={onClose} isDisabled={busy}>Cancel</Button>
            </ModalFooter>
        </Modal>
    );
};
