import {
    ActionGroup,
    Alert,
    Button,
    Checkbox,
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
    TextInput,
} from "@patternfly/react-core";
import { Table, Tbody, Td, Th, Thead, Tr } from "@patternfly/react-table";
import { useCallback, useEffect, useState } from "react";

import {
    K,
    _,
    N_,
    format,
    type Container,
    type ContainerDriver,
    type Snapshot,
} from "../backend";

const errorText = (error: unknown): string =>
    error instanceof Error ? error.message : String(error);

const formatTime = (iso: string): string => {
    if (iso === "")
        return "";
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
};

/**
 * How long ago, in the coarsest unit that is still informative.
 *
 * Each unit is a separate plural form rather than one string with a unit
 * variable, because languages do not agree on how a count and a unit combine
 * and a translator needs the whole phrase.
 */
const relativeAge = (iso: string): string => {
    const then = new Date(iso).getTime();
    if (Number.isNaN(then))
        return "";

    const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000));
    if (seconds < 60)
        return _(K.snapshots_tab.moments_ago);

    const minutes = Math.floor(seconds / 60);
    if (minutes < 60)
        return format(N_(K.snapshots_tab.minute_ago, minutes), minutes);

    const hours = Math.floor(minutes / 60);
    if (hours < 24)
        return format(N_(K.snapshots_tab.hour_ago, hours), hours);

    const days = Math.floor(hours / 24);
    return format(N_(K.snapshots_tab.day_ago, days), days);
};

interface SnapshotsTabProps {
    container: Container;
    driver: ContainerDriver;
    onChanged: () => void;
}

export const SnapshotsTab = ({ container, driver, onChanged }: SnapshotsTabProps) => {
    const [snapshots, setSnapshots] = useState<Snapshot[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [creating, setCreating] = useState(false);
    const [restoring, setRestoring] = useState<Snapshot | null>(null);
    const [deleting, setDeleting] = useState<Snapshot | null>(null);

    const load = useCallback(() => {
        driver.listSnapshots(container.name).then(
            (result) => {
                setSnapshots(result);
                setError(null);
            },
            (caught: unknown) => {
                setSnapshots([]);
                setError(errorText(caught));
            },
        );
    }, [driver, container.name]);

    useEffect(load, [load]);

    const run = async (action: () => Promise<void>) => {
        setBusy(true);
        setError(null);
        try {
            await action();
            load();
            onChanged();
        } catch (caught) {
            setError(errorText(caught));
        } finally {
            setBusy(false);
        }
    };

    if (snapshots === null)
        return <Spinner aria-label={_(K.snapshots_tab.loading_snapshots)} />;

    return (
        <div className="lxc-snapshots">
            {error !== null && <Alert variant="danger" isInline title={error} />}

            <div className="lxc-page__toolbar">
                <Button variant="primary" onClick={() => setCreating(true)} isDisabled={busy}>
                    {_(K.snapshots_tab.create_snapshot)}
                </Button>
            </div>

            {snapshots.length === 0
                ? <p className="lxc-muted">{_(K.snapshots_tab.this_container_has_no_snapshots)}</p>
                : (
                    <Table aria-label={format(_(K.snapshots_tab.snapshots_of), container.name)} variant="compact">
                        <Thead>
                            <Tr>
                                <Th modifier="nowrap">{_(K.container_list.name)}</Th>
                                <Th modifier="nowrap">{_(K.snapshots_tab.taken)}</Th>
                                <Th modifier="nowrap">{_(K.snapshots_tab.contents)}</Th>
                                <Th modifier="nowrap">{_(K.snapshots_tab.expires)}</Th>
                                <Th screenReaderText={_(K.container_list.actions)} />
                            </Tr>
                        </Thead>
                        <Tbody>
                            {snapshots.map((snapshot) => (
                                <Tr key={snapshot.name}>
                                    <Td dataLabel={_(K.container_list.name)}><strong>{snapshot.name}</strong></Td>
                                    <Td dataLabel={_(K.snapshots_tab.taken)}>
                                        {formatTime(snapshot.createdAt)}
                                        <div className="lxc-row__description">
                                            {relativeAge(snapshot.createdAt)}
                                        </div>
                                    </Td>
                                    <Td dataLabel={_(K.snapshots_tab.contents)}>
                                        {snapshot.stateful
                                            ? <Label isCompact color="blue">{_(K.snapshots_tab.disk_and_memory)}</Label>
                                            : <Label isCompact color="grey">{_(K.snapshots_tab.disk_only)}</Label>}
                                    </Td>
                                    <Td dataLabel={_(K.snapshots_tab.expires)}>
                                        {snapshot.expiresAt === null
                                            ? <span className="lxc-muted">{_(K.snapshots_tab.never)}</span>
                                            : formatTime(snapshot.expiresAt)}
                                    </Td>
                                    <Td isActionCell>
                                        <Button
                                            variant="secondary"
                                            isDisabled={busy}
                                            onClick={() => setRestoring(snapshot)}
                                        >
                                            {_(K.snapshots_tab.restore)}
                                        </Button>
                                        <Button
                                            variant="link"
                                            isDanger
                                            isDisabled={busy}
                                            onClick={() => setDeleting(snapshot)}
                                        >
                                            {_(K.container_actions.delete)}
                                        </Button>
                                    </Td>
                                </Tr>
                            ))}
                        </Tbody>
                    </Table>
                )}

            {creating && (
                <CreateSnapshotDialog
                    container={container}
                    existing={snapshots.map((s) => s.name)}
                    onClose={() => setCreating(false)}
                    onConfirm={(name, stateful) =>
                        run(() => driver.createSnapshot(container.name, name, stateful))}
                />
            )}

            {restoring !== null && (
                <RestoreDialog
                    container={container}
                    snapshot={restoring}
                    onClose={() => setRestoring(null)}
                    onConfirm={() =>
                        run(() => driver.restoreSnapshot(container.name, restoring.name))}
                />
            )}

            {deleting !== null && (
                <DeleteSnapshotDialog
                    snapshot={deleting}
                    onClose={() => setDeleting(null)}
                    onConfirm={() =>
                        run(() => driver.deleteSnapshot(container.name, deleting.name))}
                />
            )}
        </div>
    );
};

interface CreateSnapshotDialogProps {
    container: Container;
    existing: readonly string[];
    onClose: () => void;
    onConfirm: (name: string, stateful: boolean) => Promise<void>;
}

const CreateSnapshotDialog = ({
    container,
    existing,
    onClose,
    onConfirm,
}: CreateSnapshotDialogProps) => {
    const [name, setName] = useState("");
    const [stateful, setStateful] = useState(false);
    const [busy, setBusy] = useState(false);

    const duplicate = existing.includes(name);
    const valid = name !== "" && /^[a-zA-Z0-9._-]+$/.test(name) && !duplicate;

    return (
        <Modal isOpen variant="small" onClose={onClose} aria-label={_(K.snapshots_tab.create_snapshot)}>
            <ModalHeader title={format(_(K.snapshots_tab.snapshot), container.name)} />
            <ModalBody>
                <Form onSubmit={(event) => {
                    event.preventDefault();
                    if (valid) {
                        setBusy(true);
                        void onConfirm(name, stateful).finally(() => { setBusy(false); onClose(); });
                    }
                }}>
                    <FormGroup label={_(K.snapshots_tab.snapshot_name)} fieldId="lxc-snap-name" isRequired>
                        <TextInput
                            id="lxc-snap-name"
                            value={name}
                            onChange={(_event, value) => setName(value)}
                            validated={name === "" ? "default" : valid ? "success" : "error"}
                            aria-label={_(K.snapshots_tab.snapshot_name)}
                            autoComplete="off"
                        />
                        <FormHelperText>
                            <HelperText>
                                <HelperTextItem variant={duplicate ? "error" : "default"}>
                                    {duplicate
                                        ? _(K.snapshots_tab.a_snapshot_with_that_name_already)
                                        : _(K.snapshots_tab.letters_digits_dots_hyphens_and_underscores)}
                                </HelperTextItem>
                            </HelperText>
                        </FormHelperText>
                    </FormGroup>
                    <FormGroup fieldId="lxc-snap-stateful">
                        <Checkbox
                            id="lxc-snap-stateful"
                            label={_(K.snapshots_tab.include_running_process_state)}
                            isChecked={stateful}
                            isDisabled={container.state !== "Running"}
                            onChange={(_event, checked) => setStateful(checked)}
                        />
                        <FormHelperText>
                            <HelperText>
                                <HelperTextItem>
                                    {container.state === "Running"
                                        ? _(K.snapshots_tab.requires_criu_on_the_host_without)
                                        : _(K.snapshots_tab.only_available_while_the_container_runs)}
                                </HelperTextItem>
                            </HelperText>
                        </FormHelperText>
                    </FormGroup>
                </Form>
            </ModalBody>
            <ModalFooter>
                <Button variant="primary" isDisabled={!valid || busy} isLoading={busy}
                    onClick={() => {
                        setBusy(true);
                        void onConfirm(name, stateful).finally(() => { setBusy(false); onClose(); });
                    }}>
                    {_(K.dialogs.create)}
                </Button>
                <Button variant="link" onClick={onClose} isDisabled={busy}>{_(K.dialogs.cancel)}</Button>
            </ModalFooter>
        </Modal>
    );
};

/**
 * Restore confirmation.
 *
 * Restoring discards everything written since the snapshot was taken, and the
 * age is the number that tells an operator how much that is. Showing it is the
 * difference between an informed choice and a guess.
 */
const RestoreDialog = ({
    container,
    snapshot,
    onClose,
    onConfirm,
}: {
    container: Container;
    snapshot: Snapshot;
    onClose: () => void;
    onConfirm: () => Promise<void>;
}) => {
    const [busy, setBusy] = useState(false);

    return (
        <Modal isOpen variant="small" onClose={onClose} aria-label={_(K.snapshots_tab.restore_snapshot)}>
            <ModalHeader title={format(_(K.snapshots_tab.restore_2), snapshot.name)} titleIconVariant="warning" />
            <ModalBody>
                <p>
                    {format(
                        _(K.snapshots_tab.this_rolls_back_to_taken_everything),
                        container.name,
                        formatTime(snapshot.createdAt),
                        relativeAge(snapshot.createdAt),
                    )}
                </p>
                {container.state === "Running" && (
                    <Alert
                        variant="warning"
                        isInline
                        title={_(K.snapshots_tab.incus_stops_the_container_to_restore)}
                    />
                )}
            </ModalBody>
            <ModalFooter>
                <Button variant="danger" isLoading={busy} isDisabled={busy} onClick={() => {
                    setBusy(true);
                    void onConfirm().finally(() => { setBusy(false); onClose(); });
                }}>
                    {_(K.snapshots_tab.restore)}
                </Button>
                <Button variant="link" onClick={onClose} isDisabled={busy}>{_(K.dialogs.cancel)}</Button>
            </ModalFooter>
        </Modal>
    );
};

const DeleteSnapshotDialog = ({
    snapshot,
    onClose,
    onConfirm,
}: {
    snapshot: Snapshot;
    onClose: () => void;
    onConfirm: () => Promise<void>;
}) => {
    const [busy, setBusy] = useState(false);

    return (
        <Modal isOpen variant="small" onClose={onClose} aria-label={_(K.snapshots_tab.delete_snapshot)}>
            <ModalHeader title={format(_(K.snapshots_tab.delete_snapshot_2), snapshot.name)} titleIconVariant="danger" />
            <ModalBody>
                <p>{_(K.snapshots_tab.the_snapshot_is_destroyed_the_container)}</p>
            </ModalBody>
            <ModalFooter>
                <Button variant="danger" isLoading={busy} isDisabled={busy} onClick={() => {
                    setBusy(true);
                    void onConfirm().finally(() => { setBusy(false); onClose(); });
                }}>
                    Delete
                </Button>
                <Button variant="link" onClick={onClose} isDisabled={busy}>{_(K.dialogs.cancel)}</Button>
            </ModalFooter>
        </Modal>
    );
};

export { ActionGroup };
