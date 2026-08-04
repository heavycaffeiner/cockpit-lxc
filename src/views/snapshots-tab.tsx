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

import type { Container, ContainerDriver, Snapshot } from "../backend";

const errorText = (error: unknown): string =>
    error instanceof Error ? error.message : String(error);

const formatTime = (iso: string): string => {
    if (iso === "")
        return "";
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
};

/** How long ago, in the coarsest unit that is still informative. */
const relativeAge = (iso: string): string => {
    const then = new Date(iso).getTime();
    if (Number.isNaN(then))
        return "";
    const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000));
    if (seconds < 60)
        return "moments ago";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60)
        return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24)
        return `${hours} hour${hours === 1 ? "" : "s"} ago`;
    const days = Math.floor(hours / 24);
    return `${days} day${days === 1 ? "" : "s"} ago`;
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
        return <Spinner aria-label="Loading snapshots" />;

    return (
        <div className="lxc-snapshots">
            {error !== null && <Alert variant="danger" isInline title={error} />}

            <div className="lxc-page__toolbar">
                <Button variant="primary" onClick={() => setCreating(true)} isDisabled={busy}>
                    Create snapshot
                </Button>
            </div>

            {snapshots.length === 0
                ? <p className="lxc-muted">This container has no snapshots.</p>
                : (
                    <Table aria-label={`Snapshots of ${container.name}`} variant="compact">
                        <Thead>
                            <Tr>
                                <Th modifier="nowrap">Name</Th>
                                <Th modifier="nowrap">Taken</Th>
                                <Th modifier="nowrap">Contents</Th>
                                <Th modifier="nowrap">Expires</Th>
                                <Th screenReaderText="Actions" />
                            </Tr>
                        </Thead>
                        <Tbody>
                            {snapshots.map((snapshot) => (
                                <Tr key={snapshot.name}>
                                    <Td dataLabel="Name"><strong>{snapshot.name}</strong></Td>
                                    <Td dataLabel="Taken">
                                        {formatTime(snapshot.createdAt)}
                                        <div className="lxc-row__description">
                                            {relativeAge(snapshot.createdAt)}
                                        </div>
                                    </Td>
                                    <Td dataLabel="Contents">
                                        {snapshot.stateful
                                            ? <Label isCompact color="blue">Disk and memory</Label>
                                            : <Label isCompact color="grey">Disk only</Label>}
                                    </Td>
                                    <Td dataLabel="Expires">
                                        {snapshot.expiresAt === null
                                            ? <span className="lxc-muted">Never</span>
                                            : formatTime(snapshot.expiresAt)}
                                    </Td>
                                    <Td isActionCell>
                                        <Button
                                            variant="secondary"
                                            isDisabled={busy}
                                            onClick={() => setRestoring(snapshot)}
                                        >
                                            Restore
                                        </Button>
                                        <Button
                                            variant="link"
                                            isDanger
                                            isDisabled={busy}
                                            onClick={() => setDeleting(snapshot)}
                                        >
                                            Delete
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
        <Modal isOpen variant="small" onClose={onClose} aria-label="Create snapshot">
            <ModalHeader title={`Snapshot ${container.name}`} />
            <ModalBody>
                <Form onSubmit={(event) => {
                    event.preventDefault();
                    if (valid) {
                        setBusy(true);
                        void onConfirm(name, stateful).finally(() => { setBusy(false); onClose(); });
                    }
                }}>
                    <FormGroup label="Snapshot name" fieldId="lxc-snap-name" isRequired>
                        <TextInput
                            id="lxc-snap-name"
                            value={name}
                            onChange={(_event, value) => setName(value)}
                            validated={name === "" ? "default" : valid ? "success" : "error"}
                            aria-label="Snapshot name"
                            autoComplete="off"
                        />
                        <FormHelperText>
                            <HelperText>
                                <HelperTextItem variant={duplicate ? "error" : "default"}>
                                    {duplicate
                                        ? "A snapshot with that name already exists"
                                        : "Letters, digits, dots, hyphens and underscores."}
                                </HelperTextItem>
                            </HelperText>
                        </FormHelperText>
                    </FormGroup>
                    <FormGroup fieldId="lxc-snap-stateful">
                        <Checkbox
                            id="lxc-snap-stateful"
                            label="Include running process state"
                            isChecked={stateful}
                            isDisabled={container.state !== "Running"}
                            onChange={(_event, checked) => setStateful(checked)}
                        />
                        <FormHelperText>
                            <HelperText>
                                <HelperTextItem>
                                    {container.state === "Running"
                                        ? "Requires CRIU on the host. Without it the snapshot fails rather than falling back."
                                        : "Only available while the container runs."}
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
                    Create
                </Button>
                <Button variant="link" onClick={onClose} isDisabled={busy}>Cancel</Button>
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
        <Modal isOpen variant="small" onClose={onClose} aria-label="Restore snapshot">
            <ModalHeader title={`Restore ${snapshot.name}?`} titleIconVariant="warning" />
            <ModalBody>
                <p>
                    This rolls {container.name} back to {formatTime(snapshot.createdAt)}, taken{" "}
                    <strong>{relativeAge(snapshot.createdAt)}</strong>. Everything written to
                    the container since then is discarded and cannot be recovered.
                </p>
                {container.state === "Running" && (
                    <Alert
                        variant="warning"
                        isInline
                        title="Incus stops the container to restore it."
                    />
                )}
            </ModalBody>
            <ModalFooter>
                <Button variant="danger" isLoading={busy} isDisabled={busy} onClick={() => {
                    setBusy(true);
                    void onConfirm().finally(() => { setBusy(false); onClose(); });
                }}>
                    Restore
                </Button>
                <Button variant="link" onClick={onClose} isDisabled={busy}>Cancel</Button>
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
        <Modal isOpen variant="small" onClose={onClose} aria-label="Delete snapshot">
            <ModalHeader title={`Delete snapshot ${snapshot.name}?`} titleIconVariant="danger" />
            <ModalBody>
                <p>
                    The snapshot is destroyed. The container itself is untouched, but this
                    rollback point is gone for good.
                </p>
            </ModalBody>
            <ModalFooter>
                <Button variant="danger" isLoading={busy} isDisabled={busy} onClick={() => {
                    setBusy(true);
                    void onConfirm().finally(() => { setBusy(false); onClose(); });
                }}>
                    Delete
                </Button>
                <Button variant="link" onClick={onClose} isDisabled={busy}>Cancel</Button>
            </ModalFooter>
        </Modal>
    );
};

export { ActionGroup };
