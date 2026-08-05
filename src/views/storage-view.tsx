import { Alert, Button, Spinner } from "@patternfly/react-core";
import { PlusCircleIcon, SyncAltIcon } from "@patternfly/react-icons";
import { Table, Tbody, Td, Th, Thead, Tr } from "@patternfly/react-table";
import { useCallback, useState } from "react";

import { T, format, type ContainerDriver, type StoragePool } from "../backend";
import { ConfirmDelete, ResourceDialog, usedByBlocker } from "../components/resource-dialog";
import { useResourceList } from "../hooks/use-resource-list";

/**
 * Pool drivers offered on create.
 *
 * `dir` needs nothing and works everywhere. btrfs, zfs and lvm need their tools
 * and a backing device or file; Incus reports plainly when one is missing, which
 * is a better answer than this trying to detect them and being wrong.
 */
const POOL_DRIVERS = () => [
    { value: "dir", label: T.storage.directory },
    { value: "btrfs", label: "btrfs" },
    { value: "zfs", label: "ZFS" },
    { value: "lvm", label: "LVM" },
];

interface StorageViewProps {
    driver: ContainerDriver;
    onChanged: () => void;
}

export const StorageView = ({ driver, onChanged }: StorageViewProps) => {
    const load = useCallback(() => driver.listStoragePools(), [driver]);
    const { items, error, busy, reload, run } = useResourceList<StoragePool>(load);

    const [creating, setCreating] = useState(false);
    const [editing, setEditing] = useState<StoragePool | null>(null);
    const [deleting, setDeleting] = useState<StoragePool | null>(null);

    if (items === null)
        return <Spinner aria-label={T.storage.loading_storage_pools} />;

    return (
        <div className="lxc-resource">
            {error !== null && <Alert variant="danger" isInline title={error} />}

            <p className="lxc-config__description">{T.storage.a_pool_is_where_container_filesystems}</p>

            <div className="lxc-page__toolbar">
                <Button variant="primary" icon={<PlusCircleIcon />} isDisabled={busy}
                    onClick={() => setCreating(true)}>
                    {T.storage.create_pool}
                </Button>
                <Button variant="secondary" icon={<SyncAltIcon />} onClick={reload} isDisabled={busy}>
                    {T.common.refresh}
                </Button>
            </div>

            <Table aria-label={T.common.storage_pools} variant="compact">
                <Thead>
                    <Tr>
                        <Th modifier="nowrap">{T.common.name}</Th>
                        <Th modifier="nowrap">{T.storage.driver}</Th>
                        <Th>{T.common.source}</Th>
                        <Th modifier="nowrap">{T.common.used_by}</Th>
                        <Th screenReaderText={T.common.actions} />
                    </Tr>
                </Thead>
                <Tbody>
                    {items.map((pool) => (
                        <Tr key={pool.name}>
                            <Td dataLabel={T.common.name}><strong>{pool.name}</strong></Td>
                            <Td dataLabel={T.storage.driver}>{pool.driver}</Td>
                            <Td dataLabel={T.common.source}>
                                <code>{pool.config["source"] ?? ""}</code>
                            </Td>
                            <Td dataLabel={T.common.used_by}>{pool.usedBy.length}</Td>
                            <Td isActionCell modifier="nowrap">
                                <div className="lxc-rowactions">
                                    <Button variant="secondary" isDisabled={busy}
                                        onClick={() => setEditing(pool)}>
                                        {T.common.edit}
                                    </Button>
                                    <Button variant="link" isDanger isDisabled={busy}
                                        onClick={() => setDeleting(pool)}>
                                        {T.common.delete}
                                    </Button>
                                </div>
                            </Td>
                        </Tr>
                    ))}
                </Tbody>
            </Table>

            {creating && (
                <ResourceDialog
                    title={T.storage.create_pool}
                    existingName={null}
                    taken={items.map((p) => p.name)}
                    initial={{ description: "", config: {} }}
                    kind={{
                        label: T.storage.driver,
                        help: T.storage.dir_needs_nothing_the_others_need,
                        options: POOL_DRIVERS(),
                    }}
                    onClose={() => setCreating(false)}
                    onConfirm={async (name, kind, update) => {
                        await run(() => driver.createStoragePool(name, kind, update));
                        onChanged();
                    }}
                />
            )}

            {editing !== null && (
                <ResourceDialog
                    title={format(T.storage.edit_pool, editing.name)}
                    existingName={editing.name}
                    taken={[]}
                    initial={{ description: editing.description, config: editing.config }}
                    onClose={() => setEditing(null)}
                    onConfirm={async (_name, _kind, update) => {
                        await run(() => driver.updateStoragePool(editing.name, update));
                        onChanged();
                    }}
                />
            )}

            {deleting !== null && (
                <ConfirmDelete
                    title={format(T.storage.delete_pool, deleting.name)}
                    body={T.storage.the_pool_and_everything_stored_on}
                    blocker={usedByBlocker(deleting.usedBy)}
                    onClose={() => setDeleting(null)}
                    onConfirm={async () => {
                        await run(() => driver.deleteStoragePool(deleting.name));
                        onChanged();
                    }}
                />
            )}
        </div>
    );
};
