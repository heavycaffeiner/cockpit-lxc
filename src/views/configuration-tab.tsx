import {
    ActionGroup,
    Alert,
    AlertActionLink,
    Button,
    ExpandableSection,
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
    T,
    format,
    type ConfigSchema,
    type Container,
    type ContainerDriver,
    type ContainerUpdate,
    type ServerInfo,
} from "../backend";
import {
    TYPED_KEYS,
    curatedGroups,
    formLevelProblems,
    generatedGroups,
    restartPending,
    type FieldGroup,
    type FieldSpec,
} from "../config/fields";
import { EnvironmentEditor } from "./environment-editor";
import { RawConfigEditor } from "./raw-config-editor";

interface ConfigurationTabProps {
    container: Container;
    etag: string | null;
    info: ServerInfo;
    /** Incus's own option table, or null on a server that does not offer one. */
    schema: ConfigSchema | null;
    driver: ContainerDriver;
    onSaved: () => void;
    /** Offers a restart when the save contained keys that need one. */
    onRestart: () => Promise<void>;
}

const errorText = (error: unknown): string =>
    error instanceof Error ? error.message : String(error);

/**
 * Incus writes its option table in the markup its documentation is built from,
 * so a default arrives as "`1GiB`" rather than as "1GiB". Stripping the
 * backticks and collapsing the newlines is the whole of what is needed to read
 * it as a sentence.
 */
const plainText = (text: string): string =>
    text.replace(/`/g, "").replace(/\s+/g, " ").trim();

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
    schema,
    driver,
    onSaved,
    onRestart,
}: ConfigurationTabProps) => {
    // Edits only. A key absent here has not been touched.
    const [edits, setEdits] = useState<Record<string, string>>({});
    const [rawEdits, setRawEdits] = useState<Record<string, string> | null>(null);
    const [envEdits, setEnvEdits] = useState<Record<string, string> | null>(null);
    /** Keys from the last save that only take effect at the next start. */
    const [pending, setPending] = useState<readonly string[]>([]);

    const curated = useMemo(() => curatedGroups(schema), [schema]);
    const generated = useMemo(() => generatedGroups(schema), [schema]);

    /*
     * Keys the forms own between them, so the raw editor is left with exactly
     * what nothing else can express: the wildcard families and any key the
     * server accepts without documenting.
     */
    const ownedKeys = useMemo(() => {
        const owned = new Set<string>(TYPED_KEYS);
        for (const group of [...curated, ...generated])
            for (const field of group.fields)
                owned.add(field.key);
        return owned;
    }, [curated, generated]);

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
        if (envEdits !== null)
            Object.assign(base, envEdits);
        if (rawEdits !== null)
            Object.assign(base, rawEdits);
        // An emptied field means "unset", which PUT expresses by omission.
        for (const [key, value] of Object.entries(base)) {
            if (value === "")
                delete base[key];
        }
        return base;
    }, [baseConfig, edits, envEdits, rawEdits]);

    const fieldProblems = useMemo(() => {
        const problems: Record<string, string> = {};
        for (const group of curated) {
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
    }, [edits, curated]);

    const crossFieldProblems = useMemo(() => formLevelProblems(merged), [merged]);

    const dirty =
        Object.keys(edits).length > 0 || rawEdits !== null || envEdits !== null;
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
        setEnvEdits(null);
        setBaseline(null);
        setError(null);
    };

    /** Every key this edit touched, which is what the restart notice reports on. */
    const touchedKeys = (): string[] => [
        ...new Set([
            ...Object.keys(edits),
            ...Object.keys(rawEdits ?? {}),
            ...Object.keys(envEdits ?? {}),
        ]),
    ];

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
            const saved = touchedKeys();
            await driver.updateConfig(container.name, buildUpdate(), saveEtag);
            // Read before discarding, since discarding clears what was touched.
            setPending(restartPending(schema, saved, container.state === "Running"));
            discard();
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
                /*
                 * The key beside the label, so an operator reading Incus's own
                 * documentation can find the field. A generated field is already
                 * labelled with its key, and repeating it there reads as a bug.
                 */
                {...(field.label === field.key
                    ? {}
                    : { labelHelp: <span className="lxc-field__key">{field.key}</span> })}
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
                        {field.spec !== undefined && field.spec.defaultText !== "" && (
                            <HelperTextItem>
                                {/*
                                  * The server's own default, so an empty field
                                  * is not read as zero or as off.
                                  */}
                                {format(T.fields.default_is, plainText(field.spec.defaultText))}
                            </HelperTextItem>
                        )}
                        {field.spec !== undefined && !field.spec.liveUpdate && (
                            <HelperTextItem>
                                {T.fields.takes_effect_after_a_restart}
                            </HelperTextItem>
                        )}
                        {field.spec?.unprivilegedOnly === true && (
                            <HelperTextItem>
                                {T.fields.only_applies_while_the_container_is}
                            </HelperTextItem>
                        )}
                        {isInherited && value !== "" && (
                            <HelperTextItem>
                                {T.config.inherited_from_a_profile_editing_copies}
                            </HelperTextItem>
                        )}
                    </HelperText>
                </FormHelperText>
            </FormGroup>
        );
    };

    const renderGroup = (group: FieldGroup) => {
        const body = (
            <>
                {group.description !== "" && (
                    <p className="lxc-config__description">{group.description}</p>
                )}
                {group.fields.map(renderField)}
            </>
        );

        /*
         * Generated groups arrive collapsed. There are far more of them than
         * curated ones, and 50 further fields expanded on arrival would bury the
         * handful that most edits actually touch.
         */
        return group.collapsed === true
            ? (
                <ExpandableSection
                    key={group.id}
                    toggleText={format(T.fields.options, group.title, group.fields.length)}
                    className="lxc-config__generated"
                >
                    {body}
                </ExpandableSection>
            )
            : (
                <FormSection key={group.id} title={group.title} titleElement="h3">
                    {body}
                </FormSection>
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
                    title={T.config.this_container_could_not_be_locked}
                />
            )}

            {movedUnderEdit && (
                <Alert
                    variant="info"
                    isInline
                    title={T.config.this_container_changed_elsewhere_while_you}
                />
            )}

            {/*
              * Saying this once after the save, rather than leaving the operator
              * to wonder why a stored setting has not taken effect. Dismissed
              * rather than persisted: nothing here can learn that a restart
              * happened elsewhere, and a stale notice is worse than none.
              */}
            {pending.length > 0 && (
                <Alert
                    variant="info"
                    isInline
                    title={format(T.fields.saved_these_take_effect_after_a, pending.join(", "))}
                    actionClose={
                        <Button variant="plain" onClick={() => setPending([])}
                            aria-label={T.list.dismiss_error}>
                            &times;
                        </Button>
                    }
                >
                    <AlertActionLink onClick={() => {
                        setPending([]);
                        void onRestart();
                    }}>
                        {T.actions.restart}
                    </AlertActionLink>
                </Alert>
            )}

            <Form
                onSubmit={(event) => {
                    event.preventDefault();
                    if (canSave)
                        void save();
                }}
            >
                {curated.map(renderGroup)}

                <FormSection title={T.config.environment} titleElement="h3">
                    <p className="lxc-config__description">
                        {T.config.variables_put_into_the_environment_of}
                    </p>
                    <EnvironmentEditor
                        key={`env-${JSON.stringify(baseConfig)}`}
                        localConfig={baseConfig}
                        onChange={(next) => {
                            beginEdit();
                            setEnvEdits(next);
                        }}
                    />
                </FormSection>

                {generated.map(renderGroup)}

                <FormSection title={T.config.other_keys} titleElement="h3">
                    <p className="lxc-config__description">
                        {T.config.everything_the_forms_above_do_not}
                    </p>
                    {/*
                      * Keyed on the server's own config, so a save or an
                      * event-driven refresh reseeds the rows by remounting
                      * instead of through an effect. `excluded` covers whatever
                      * the forms above render, so what is left here is the
                      * wildcard families and any key the server accepts without
                      * documenting.
                      */}
                    <RawConfigEditor
                        key={JSON.stringify(baseConfig)}
                        localConfig={baseConfig}
                        excluded={ownedKeys}
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
                        {T.common.save}
                    </Button>
                    <Button variant="link" isDisabled={!dirty || busy} onClick={discard}>
                        {T.config.discard_changes}
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
    <Modal isOpen variant="medium" onClose={onKeepEditing} aria-label={T.config.configuration_conflict}>
        <ModalHeader title={T.config.this_container_changed_while_you_were} titleIconVariant="warning" />
        <ModalBody>
            <p>{T.config.another_session_saved_a_change_after}</p>
            {keys.length === 0
                ? <p>{T.config.no_individual_key_differs_the_container}</p>
                : (
                    <table className="lxc-conflict" aria-label={T.config.configuration_conflict}>
                        <thead>
                            <tr>
                                <th scope="col">{T.config.key}</th>
                                <th scope="col">{T.config.on_the_server}</th>
                                <th scope="col">{T.config.in_this_form}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {keys.map((key) => (
                                <tr key={key}>
                                    <th scope="row"><code>{key}</code></th>
                                    <td>{theirs[key] ?? <em>{T.config.unset}</em>}</td>
                                    <td>{mine[key] ?? <em>{T.config.unset}</em>}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
        </ModalBody>
        <ModalFooter>
            <Button variant="secondary" onClick={onKeepEditing}>
                {T.config.keep_editing}
            </Button>
            <Button variant="primary" onClick={onReload}>
                {T.config.discard_my_changes_and_reload}
            </Button>
        </ModalFooter>
    </Modal>
);

export { AlertActionLink };
