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
    Modal,
    ModalBody,
    ModalFooter,
    ModalHeader,
    TextInput,
} from "@patternfly/react-core";
import { useState } from "react";

import { T, format, type ResourceUpdate } from "../backend";
import { ConfigRows } from "./config-rows";

/** A create-only choice, such as a network's type or a pool's driver. */
export interface KindChoice {
    label: string;
    help: string;
    options: readonly { value: string; label: string }[];
}

interface ResourceDialogProps {
    /** Dialog title, already worded for create or edit. */
    title: string;
    /** Null when creating; the existing name when editing, which is fixed. */
    existingName: string | null;
    /** Names already taken, so a create cannot collide. */
    taken: readonly string[];
    initial: ResourceUpdate;
    /** Offered on create only, because Incus does not let either change after. */
    kind?: KindChoice;
    onClose: () => void;
    onConfirm: (name: string, kind: string, update: ResourceUpdate) => Promise<void>;
}

const NAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

/**
 * Create or edit a profile, network or storage pool.
 *
 * One dialog for all three because the shape is genuinely the same: a name, a
 * description, an open config map, and on create one immutable choice of kind.
 * What differs between them is the table that lists them, not this.
 */
export const ResourceDialog = ({
    title,
    existingName,
    taken,
    initial,
    kind,
    onClose,
    onConfirm,
}: ResourceDialogProps) => {
    const creating = existingName === null;

    const [name, setName] = useState(existingName ?? "");
    const [kindValue, setKindValue] = useState(kind?.options[0]?.value ?? "");
    const [description, setDescription] = useState(initial.description);
    const [config, setConfig] = useState<Record<string, string>>(initial.config);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const duplicate = creating && taken.includes(name.trim());
    const valid = !creating || (NAME_PATTERN.test(name.trim()) && !duplicate);

    const submit = async () => {
        setBusy(true);
        setError(null);
        try {
            await onConfirm(name.trim(), kindValue, { description, config });
            onClose();
        } catch (caught) {
            // The dialog stays open on failure: closing it would discard an
            // edit the operator would then have to retype.
            setError(caught instanceof Error ? caught.message : String(caught));
        } finally {
            setBusy(false);
        }
    };

    return (
        <Modal isOpen variant="medium" onClose={onClose} aria-label={title}>
            <ModalHeader title={title} />
            <ModalBody>
                {error !== null && <Alert variant="danger" isInline title={error} />}
                <Form onSubmit={(event) => event.preventDefault()}>
                    <FormGroup label={T.common.name} fieldId="lxc-resource-name" isRequired>
                        <TextInput
                            id="lxc-resource-name"
                            value={name}
                            isDisabled={!creating}
                            onChange={(_event, value) => setName(value)}
                            validated={creating && name !== "" && !valid ? "error" : "default"}
                            aria-label={T.common.name}
                            autoComplete="off"
                        />
                        <FormHelperText>
                            <HelperText>
                                <HelperTextItem variant={duplicate ? "error" : "default"}>
                                    {!creating
                                        ? T.resources.the_name_is_fixed_after_creation
                                        : duplicate
                                            ? T.resources.that_name_is_already_taken
                                            : T.resources.letters_digits_dots_hyphens_and_underscores}
                                </HelperTextItem>
                            </HelperText>
                        </FormHelperText>
                    </FormGroup>

                    {creating && kind !== undefined && (
                        <FormGroup label={kind.label} fieldId="lxc-resource-kind" isRequired>
                            <FormSelect
                                id="lxc-resource-kind"
                                value={kindValue}
                                onChange={(_event, value) => setKindValue(value)}
                                aria-label={kind.label}
                            >
                                {kind.options.map((option) => (
                                    <FormSelectOption
                                        key={option.value}
                                        value={option.value}
                                        label={option.label}
                                    />
                                ))}
                            </FormSelect>
                            <FormHelperText>
                                <HelperText>
                                    <HelperTextItem>{kind.help}</HelperTextItem>
                                </HelperText>
                            </FormHelperText>
                        </FormGroup>
                    )}

                    <FormGroup label={T.common.description} fieldId="lxc-resource-description">
                        <TextInput
                            id="lxc-resource-description"
                            value={description}
                            onChange={(_event, value) => setDescription(value)}
                            aria-label={T.common.description}
                        />
                    </FormGroup>

                    <FormGroup label={T.resources.configuration} fieldId="lxc-resource-config">
                        <ConfigRows config={initial.config} onChange={setConfig} label={title} />
                    </FormGroup>
                </Form>
            </ModalBody>
            <ModalFooter>
                <Button
                    variant="primary"
                    isDisabled={!valid || busy}
                    isLoading={busy}
                    onClick={() => void submit()}
                >
                    {creating ? T.common.create : T.common.save}
                </Button>
                <Button variant="link" onClick={onClose} isDisabled={busy}>
                    {T.common.cancel}
                </Button>
            </ModalFooter>
        </Modal>
    );
};

interface ConfirmDeleteProps {
    title: string;
    /** What is destroyed, stated plainly. */
    body: string;
    /** Non-empty when something still uses it, which blocks the delete. */
    blocker: string | null;
    onClose: () => void;
    onConfirm: () => Promise<void>;
}

/**
 * Delete confirmation for a resource.
 *
 * A resource in use is refused here rather than at the API, so the operator
 * reads why instead of a raw error, and the destructive button is not offered
 * for something that cannot succeed.
 */
export const ConfirmDelete = ({ title, body, blocker, onClose, onConfirm }: ConfirmDeleteProps) => {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    return (
        <Modal isOpen variant="small" onClose={onClose} aria-label={title}>
            <ModalHeader title={title} titleIconVariant="danger" />
            <ModalBody>
                {error !== null && <Alert variant="danger" isInline title={error} />}
                <p>{body}</p>
                {blocker !== null && (
                    <Alert variant="warning" isInline title={blocker} className="lxc-blocker" />
                )}
            </ModalBody>
            <ModalFooter>
                <Button
                    variant="danger"
                    isDisabled={busy || blocker !== null}
                    isLoading={busy}
                    onClick={() => {
                        setBusy(true);
                        setError(null);
                        void onConfirm().then(
                            () => { setBusy(false); onClose(); },
                            (caught: unknown) => {
                                setBusy(false);
                                setError(caught instanceof Error ? caught.message : String(caught));
                            },
                        );
                    }}
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

/** "Used by 3 containers", or the reason a delete is blocked. */
export const usedByBlocker = (usedBy: readonly string[]): string | null =>
    usedBy.length === 0 ? null : format(T.resources.still_used_by, usedBy.length, usedBy.join(", "));
