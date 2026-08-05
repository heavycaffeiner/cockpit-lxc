import {
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
    T,
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
        return T.snapshots.moments_ago;

    const minutes = Math.floor(seconds / 60);
    if (minutes < 60)
        return format(T.snapshots.minute_ago(minutes), minutes);

    const hours = Math.floor(minutes / 60);
    if (hours < 24)
        return format(T.snapshots.hour_ago(hours), hours);

    const days = Math.floor(hours / 24);
    return format(T.snapshots.day_ago(days), days);
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
    const [renaming, setRenaming] = useState<Snapshot | null>(null);
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
        return <Spinner aria-label={T.snapshots.loading_snapshots} />;

    return (
        <div className="lxc-snapshots">
            {error !== null && <Alert variant="danger" isInline title={error} />}

            <div className="lxc-page__toolbar">
                <Button variant="primary" onClick={() => setCreating(true)} isDisabled={busy}>
                    {T.snapshots.create_snapshot}
                </Button>
            </div>

            {snapshots.length === 0
                ? <p className="lxc-muted">{T.snapshots.this_container_has_no_snapshots}</p>
                : (
                    <Table aria-label={format(T.snapshots.snapshots_of, container.name)} variant="compact">
                        <Thead>
                            <Tr>
                                <Th modifier="nowrap">{T.common.name}</Th>
                                <Th modifier="nowrap">{T.snapshots.taken}</Th>
                                <Th modifier="nowrap">{T.snapshots.contents}</Th>
                                <Th modifier="nowrap">{T.snapshots.expires}</Th>
                                <Th screenReaderText={T.common.actions} />
                            </Tr>
                        </Thead>
                        <Tbody>
                            {snapshots.map((snapshot) => (
                                <Tr key={snapshot.name}>
                                    <Td dataLabel={T.common.name}><strong>{snapshot.name}</strong></Td>
                                    <Td dataLabel={T.snapshots.taken}>
                                        {formatTime(snapshot.createdAt)}
                                        <div className="lxc-row__description">
                                            {relativeAge(snapshot.createdAt)}
                                        </div>
                                    </Td>
                                    <Td dataLabel={T.snapshots.contents}>
                                        {snapshot.stateful
                                            ? <Label isCompact color="blue">{T.snapshots.disk_and_memory}</Label>
                                            : <Label isCompact color="grey">{T.snapshots.disk_only}</Label>}
                                    </Td>
                                    <Td dataLabel={T.snapshots.expires}>
                                        {snapshot.expiresAt === null
                                            ? <span className="lxc-muted">{T.snapshots.never}</span>
                                            : formatTime(snapshot.expiresAt)}
                                    </Td>
                                    <Td isActionCell modifier="nowrap">
                                        <div className="lxc-rowactions">
                                            <Button
                                                variant="secondary"
                                                isDisabled={busy}
                                                onClick={() => setRestoring(snapshot)}
                                            >
                                                {T.snapshots.restore}
                                            </Button>
                                            <Button
                                                variant="secondary"
                                                isDisabled={busy}
                                                onClick={() => setRenaming(snapshot)}
                                            >
                                                {T.common.rename}
                                            </Button>
                                            <Button
                                                variant="link"
                                                isDanger
                                                isDisabled={busy}
                                                onClick={() => setDeleting(snapshot)}
                                            >
                                                {T.common.delete}
                                            </Button>
                                        </div>
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

            {renaming !== null && (
                <RenameSnapshotDialog
                    snapshot={renaming}
                    existing={snapshots.map((s) => s.name)}
                    onClose={() => setRenaming(null)}
                    onConfirm={(newName) =>
                        run(() => driver.renameSnapshot(container.name, renaming.name, newName))}
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
        <Modal isOpen variant="small" onClose={onClose} aria-label={T.snapshots.create_snapshot}>
            <ModalHeader title={format(T.snapshots.snapshot, container.name)} />
            <ModalBody>
                <Form onSubmit={(event) => {
                    event.preventDefault();
                    if (valid) {
                        setBusy(true);
                        void onConfirm(name, stateful).finally(() => { setBusy(false); onClose(); });
                    }
                }}>
                    <FormGroup label={T.snapshots.snapshot_name} fieldId="lxc-snap-name" isRequired>
                        <TextInput
                            id="lxc-snap-name"
                            value={name}
                            onChange={(_event, value) => setName(value)}
                            validated={name === "" ? "default" : valid ? "success" : "error"}
                            aria-label={T.snapshots.snapshot_name}
                            autoComplete="off"
                        />
                        <FormHelperText>
                            <HelperText>
                                <HelperTextItem variant={duplicate ? "error" : "default"}>
                                    {duplicate
                                        ? T.snapshots.a_snapshot_with_that_name_already
                                        : T.snapshots.letters_digits_dots_hyphens_and_underscores}
                                </HelperTextItem>
                            </HelperText>
                        </FormHelperText>
                    </FormGroup>
                    <FormGroup fieldId="lxc-snap-stateful">
                        <Checkbox
                            id="lxc-snap-stateful"
                            label={T.snapshots.include_running_process_state}
                            isChecked={stateful}
                            isDisabled={container.state !== "Running"}
                            onChange={(_event, checked) => setStateful(checked)}
                        />
                        <FormHelperText>
                            <HelperText>
                                <HelperTextItem>
                                    {container.state === "Running"
                                        ? T.snapshots.requires_criu_on_the_host_without
                                        : T.snapshots.only_available_while_the_container_runs}
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
                    {T.common.create}
                </Button>
                <Button variant="link" onClick={onClose} isDisabled={busy}>{T.common.cancel}</Button>
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
        <Modal isOpen variant="small" onClose={onClose} aria-label={T.snapshots.restore_snapshot}>
            <ModalHeader title={format(T.snapshots.restore_2, snapshot.name)} titleIconVariant="warning" />
            <ModalBody>
                <p>
                    {format(
                        T.snapshots.this_rolls_back_to_taken_everything,
                        container.name,
                        formatTime(snapshot.createdAt),
                        relativeAge(snapshot.createdAt),
                    )}
                </p>
                {container.state === "Running" && (
                    <Alert
                        variant="warning"
                        isInline
                        title={T.snapshots.incus_stops_the_container_to_restore}
                    />
                )}
            </ModalBody>
            <ModalFooter>
                <Button variant="danger" isLoading={busy} isDisabled={busy} onClick={() => {
                    setBusy(true);
                    void onConfirm().finally(() => { setBusy(false); onClose(); });
                }}>
                    {T.snapshots.restore}
                </Button>
                <Button variant="link" onClick={onClose} isDisabled={busy}>{T.common.cancel}</Button>
            </ModalFooter>
        </Modal>
    );
};

const RenameSnapshotDialog = ({
    snapshot,
    existing,
    onClose,
    onConfirm,
}: {
    snapshot: Snapshot;
    existing: readonly string[];
    onClose: () => void;
    onConfirm: (newName: string) => Promise<void>;
}) => {
    const [name, setName] = useState(snapshot.name);
    const [busy, setBusy] = useState(false);

    const duplicate = name !== snapshot.name && existing.includes(name);
    const valid = name !== "" && name !== snapshot.name &&
        /^[a-zA-Z0-9._-]+$/.test(name) && !duplicate;

    const submit = () => {
        setBusy(true);
        void onConfirm(name).finally(() => { setBusy(false); onClose(); });
    };

    return (
        <Modal isOpen variant="small" onClose={onClose} aria-label={T.snapshots.rename_snapshot}>
            <ModalHeader title={format(T.snapshots.rename, snapshot.name)} />
            <ModalBody>
                <Form onSubmit={(event) => { event.preventDefault(); if (valid) submit(); }}>
                    <FormGroup label={T.snapshots.snapshot_name} fieldId="lxc-snap-rename" isRequired>
                        <TextInput
                            id="lxc-snap-rename"
                            value={name}
                            onChange={(_event, value) => setName(value)}
                            validated={name === snapshot.name ? "default" : valid ? "success" : "error"}
                            aria-label={T.snapshots.snapshot_name}
                            autoComplete="off"
                        />
                        <FormHelperText>
                            <HelperText>
                                <HelperTextItem variant={duplicate ? "error" : "default"}>
                                    {duplicate
                                        ? T.snapshots.a_snapshot_with_that_name_already
                                        : T.snapshots.letters_digits_dots_hyphens_and_underscores}
                                </HelperTextItem>
                            </HelperText>
                        </FormHelperText>
                    </FormGroup>
                </Form>
            </ModalBody>
            <ModalFooter>
                <Button variant="primary" isDisabled={!valid || busy} isLoading={busy} onClick={submit}>
                    {T.common.rename}
                </Button>
                <Button variant="link" onClick={onClose} isDisabled={busy}>{T.common.cancel}</Button>
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
        <Modal isOpen variant="small" onClose={onClose} aria-label={T.snapshots.delete_snapshot}>
            <ModalHeader title={format(T.snapshots.delete_snapshot_2, snapshot.name)} titleIconVariant="danger" />
            <ModalBody>
                <p>{T.snapshots.the_snapshot_is_destroyed_the_container}</p>
            </ModalBody>
            <ModalFooter>
                <Button variant="danger" isLoading={busy} isDisabled={busy} onClick={() => {
                    setBusy(true);
                    void onConfirm().finally(() => { setBusy(false); onClose(); });
                }}>
                    {T.common.delete}
                </Button>
                <Button variant="link" onClick={onClose} isDisabled={busy}>{T.common.cancel}</Button>
            </ModalFooter>
        </Modal>
    );
};
