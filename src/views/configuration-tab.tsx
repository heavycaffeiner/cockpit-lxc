import {
    ActionGroup,
    Alert,
    AlertActionLink,
    Button,
    Form,
    FormGroup,
    FormHelperText,
    FormSection,
    HelperText,
    HelperTextItem,
    Modal,
    ModalBody,
    ModalFooter,
    ModalHeader,
    FormSelect,
    FormSelectOption,
    TextArea,
    TextInput,
} from "@patternfly/react-core";
import { useMemo, useState } from "react";

import {
    ConflictError,
    type Container,
    type ContainerDriver,
    type ContainerUpdate,
    type ServerInfo,
} from "../backend";
import { FIELD_GROUPS, TYPED_KEYS, formLevelProblems, type FieldSpec } from "../config/fields";
import { RawConfigEditor } from "./raw-config-editor";

interface ConfigurationTabProps {
    container: Container;
    etag: string | null;
    info: ServerInfo;
    driver: ContainerDriver;
    onSaved: () => void;
}

const errorText = (error: unknown): string =>
    error instanceof Error ? error.message : String(error);

/**
 * Typed configuration forms over the instance-local config.
 *
 * Fields show the effective value so an operator sees what the container runs
 * with, but an untouched field is never written: writing back an inherited
 * value would copy it onto the instance and quietly detach that key from the
 * profile supplying it.
 */
export const ConfigurationTab = ({
    container,
    etag,
    info,
    driver,
    onSaved,
}: ConfigurationTabProps) => {
    // Edits only. A key absent here has not been touched.
    const [edits, setEdits] = useState<Record<string, string>>({});
    const [rawEdits, setRawEdits] = useState<Record<string, string> | null>(null);

    /*
     * The snapshot this edit is based on, pinned at the first keystroke.
     *
     * Without this the conflict detection defeats itself. The live event stream
     * refetches the instance whenever anything changes it, including a change
     * made by another session, and adopting that fresh ETag would let the save
     * sail through and overwrite exactly the change the operator needed to be
     * told about. Pinning keeps the precondition tied to what was on screen when
     * the editing started, which is what makes a 412 arrive when it should.
     */
    const [baseline, setBaseline] = useState<
        { etag: string | null; config: Record<string, string> } | null
    >(null);

    const beginEdit = () => {
        if (baseline === null)
            setBaseline({ etag, config: container.localConfig });
    };

    const baseConfig = baseline?.config ?? container.localConfig;
    const saveEtag = baseline !== null ? baseline.etag : etag;
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [conflict, setConflict] = useState<{ keys: readonly string[]; current: Container } | null>(null);

    const effective = (key: string): string =>
        edits[key] ?? container.config[key] ?? "";

    const inherited = (key: string): boolean =>
        edits[key] === undefined &&
        container.localConfig[key] === undefined &&
        container.config[key] !== undefined;

    const merged = useMemo(() => {
        const base: Record<string, string> = { ...baseConfig, ...edits };
        if (rawEdits !== null)
            Object.assign(base, rawEdits);
        // An emptied field means "unset", which PUT expresses by omission.
        for (const [key, value] of Object.entries(base)) {
            if (value === "")
                delete base[key];
        }
        return base;
    }, [baseConfig, edits, rawEdits]);

    const fieldProblems = useMemo(() => {
        const problems: Record<string, string> = {};
        for (const group of FIELD_GROUPS) {
            for (const field of group.fields) {
                const value = edits[field.key];
                if (value === undefined || field.validate === undefined)
                    continue;
                const problem = field.validate(value);
                if (problem !== null)
                    problems[field.key] = problem;
            }
        }
        return problems;
    }, [edits]);

    const crossFieldProblems = useMemo(() => formLevelProblems(merged), [merged]);

    const dirty = Object.keys(edits).length > 0 || rawEdits !== null;
    const canSave = dirty && Object.keys(fieldProblems).length === 0 && saveEtag !== null && !busy;

    /*
     * The instance moved under an open edit. The save will be refused rather
     * than clobber it, but saying so now beats letting the operator find out
     * after typing for a while.
     */
    const movedUnderEdit = dirty && baseline !== null && baseline.etag !== etag;

    const discard = () => {
        setEdits({});
        setRawEdits(null);
        setBaseline(null);
        setError(null);
    };

    const buildUpdate = (): ContainerUpdate => ({
        architecture: container.architecture,
        description: container.description,
        ephemeral: container.ephemeral,
        profiles: container.profiles,
        config: merged,
        devices: container.localDevices,
    });

    const save = async () => {
        if (saveEtag === null)
            return;
        setBusy(true);
        setError(null);
        try {
            await driver.updateConfig(container.name, buildUpdate(), saveEtag);
            setEdits({});
            setRawEdits(null);
            setBaseline(null);
            onSaved();
        } catch (caught) {
            if (caught instanceof ConflictError) {
                setConflict({
                    keys: caught.conflicts,
                    current: caught.current as Container,
                });
            } else {
                setError(errorText(caught));
            }
        } finally {
            setBusy(false);
        }
    };

    const renderField = (field: FieldSpec) => {
        if (field.extension !== undefined && !info.extensions.has(field.extension))
            return null;

        const value = effective(field.key);
        const problem = fieldProblems[field.key];
        const isInherited = inherited(field.key);
        const onChange = (next: string) => {
            beginEdit();
            setEdits((current) => ({ ...current, [field.key]: next }));
        };

        return (
            <FormGroup
                key={field.key}
                label={field.label}
                fieldId={`lxc-cfg-${field.key}`}
                labelHelp={<span className="lxc-field__key">{field.key}</span>}
            >
                {field.kind === "select" && (
                    <FormSelect
                        id={`lxc-cfg-${field.key}`}
                        value={value}
                        onChange={(_event, next) => onChange(next)}
                        aria-label={field.label}
                    >
                        {(field.options ?? []).map((option) => (
                            <FormSelectOption
                                key={option.value}
                                value={option.value}
                                label={option.label}
                            />
                        ))}
                    </FormSelect>
                )}
                {field.kind === "textarea" && (
                    <TextArea
                        id={`lxc-cfg-${field.key}`}
                        value={value}
                        onChange={(_event, next) => onChange(next)}
                        rows={6}
                        aria-label={field.label}
                        resizeOrientation="vertical"
                    />
                )}
                {(field.kind === "text" || field.kind === "number") && (
                    <TextInput
                        id={`lxc-cfg-${field.key}`}
                        value={value}
                        type={field.kind === "number" ? "number" : "text"}
                        onChange={(_event, next) => onChange(next)}
                        validated={problem === undefined ? "default" : "error"}
                        placeholder={field.placeholder ?? ""}
                        aria-label={field.label}
                    />
                )}
                <FormHelperText>
                    <HelperText>
                        <HelperTextItem variant={problem === undefined ? "default" : "error"}>
                            {problem ?? field.help}
                        </HelperTextItem>
                        {isInherited && value !== "" && (
                            <HelperTextItem>
                                Inherited from a profile. Editing copies it onto this container.
                            </HelperTextItem>
                        )}
                    </HelperText>
                </FormHelperText>
            </FormGroup>
        );
    };

    return (
        <div className="lxc-config">
            {error !== null && <Alert variant="danger" isInline title={error} />}

            {crossFieldProblems.map((problem) => (
                <Alert key={problem} variant="warning" isInline isPlain title={problem} />
            ))}

            {saveEtag === null && (
                <Alert
                    variant="warning"
                    isInline
                    title="This container could not be locked for editing, so saving is disabled."
                />
            )}

            {movedUnderEdit && (
                <Alert
                    variant="info"
                    isInline
                    title="This container changed elsewhere while you were editing. Your changes are still here, and saving will show you what differs before anything is overwritten."
                />
            )}

            <Form
                onSubmit={(event) => {
                    event.preventDefault();
                    if (canSave)
                        void save();
                }}
            >
                {FIELD_GROUPS.map((group) => (
                    <FormSection key={group.id} title={group.title} titleElement="h3">
                        <p className="lxc-config__description">{group.description}</p>
                        {group.fields.map(renderField)}
                    </FormSection>
                ))}

                <FormSection title="Other keys" titleElement="h3">
                    <p className="lxc-config__description">
                        Everything the forms above do not cover, including{" "}
                        <code>raw.lxc</code>. This is what keeps every Incus setting
                        reachable as new keys are added.
                    </p>
                    {/*
                      * Keyed on the server's own config, so a save or an
                      * event-driven refresh reseeds the rows by remounting
                      * instead of through an effect.
                      */}
                    <RawConfigEditor
                        key={JSON.stringify(baseConfig)}
                        localConfig={baseConfig}
                        excluded={TYPED_KEYS}
                        onChange={(next) => {
                            beginEdit();
                            setRawEdits(next);
                        }}
                    />
                </FormSection>

                <ActionGroup>
                    <Button
                        variant="primary"
                        isDisabled={!canSave}
                        isLoading={busy}
                        onClick={() => void save()}
                    >
                        Save
                    </Button>
                    <Button variant="link" isDisabled={!dirty || busy} onClick={discard}>
                        Discard changes
                    </Button>
                </ActionGroup>
            </Form>

            {conflict !== null && (
                <ConflictDialog
                    keys={conflict.keys}
                    mine={merged}
                    theirs={conflict.current.localConfig}
                    onReload={() => {
                        setConflict(null);
                        discard();
                        onSaved();
                    }}
                    onKeepEditing={() => setConflict(null)}
                />
            )}
        </div>
    );
};

interface ConflictDialogProps {
    keys: readonly string[];
    mine: Record<string, string>;
    theirs: Record<string, string>;
    onReload: () => void;
    onKeepEditing: () => void;
}

/**
 * Shown when the instance changed under an edit.
 *
 * It never discards the operator's input on its own. The two ways out are
 * reloading, which drops the edit deliberately, and going back to the form with
 * everything still typed in.
 */
const ConflictDialog = ({
    keys,
    mine,
    theirs,
    onReload,
    onKeepEditing,
}: ConflictDialogProps) => (
    <Modal isOpen variant="medium" onClose={onKeepEditing} aria-label="Configuration conflict">
        <ModalHeader title="This container changed while you were editing" titleIconVariant="warning" />
        <ModalBody>
            <p>
                Another session saved a change after this form was opened, so the save was
                refused rather than overwriting it. Nothing has been lost on either side.
            </p>
            {keys.length === 0
                ? <p>No individual key differs; the container was changed in some other way.</p>
                : (
                    <table className="lxc-conflict">
                        <thead>
                            <tr>
                                <th scope="col">Key</th>
                                <th scope="col">On the server</th>
                                <th scope="col">In this form</th>
                            </tr>
                        </thead>
                        <tbody>
                            {keys.map((key) => (
                                <tr key={key}>
                                    <th scope="row"><code>{key}</code></th>
                                    <td>{theirs[key] ?? <em>unset</em>}</td>
                                    <td>{mine[key] ?? <em>unset</em>}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
        </ModalBody>
        <ModalFooter>
            <Button variant="secondary" onClick={onKeepEditing}>
                Keep editing
            </Button>
            <Button variant="primary" onClick={onReload}>
                Discard my changes and reload
            </Button>
        </ModalFooter>
    </Modal>
);

export { AlertActionLink };
