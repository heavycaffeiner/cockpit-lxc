import { Alert, Button, Spinner } from "@patternfly/react-core";
import { PlusCircleIcon, SyncAltIcon } from "@patternfly/react-icons";
import { Table, Tbody, Td, Th, Thead, Tr } from "@patternfly/react-table";
import { useCallback, useState } from "react";

import { T, format, type ContainerDriver, type Profile } from "../backend";
import { ConfirmDelete, ResourceDialog, usedByBlocker } from "../components/resource-dialog";
import { useResourceList } from "../hooks/use-resource-list";

interface ProfilesViewProps {
    driver: ContainerDriver;
    /** Refreshes the container list, whose profile column this can change. */
    onChanged: () => void;
}

const describeDevices = (devices: Record<string, Record<string, string>>) =>
    Object.entries(devices).map(([name, device]) => (
        <div key={name}>
            <code>{name}</code>{" "}
            <span className="lxc-muted">
                {device["type"]}
                {device["network"] !== undefined && format(T.profiles.on_network, device["network"])}
                {device["pool"] !== undefined && format(T.profiles.in_pool, device["pool"])}
            </span>
        </div>
    ));

export const ProfilesView = ({ driver, onChanged }: ProfilesViewProps) => {
    const load = useCallback(() => driver.listProfiles(), [driver]);
    const { items, error, busy, reload, run } = useResourceList<Profile>(load);

    const [creating, setCreating] = useState(false);
    const [editing, setEditing] = useState<Profile | null>(null);
    const [deleting, setDeleting] = useState<Profile | null>(null);

    if (items === null)
        return <Spinner aria-label={T.profiles.loading_profiles} />;

    const changed = () => { reload(); onChanged(); };

    return (
        <div className="lxc-resource">
            {error !== null && <Alert variant="danger" isInline title={error} />}

            <p className="lxc-config__description">
                {T.profiles.profiles_supply_configuration_and_devices_to}
            </p>

            <div className="lxc-page__toolbar">
                <Button variant="primary" icon={<PlusCircleIcon />} isDisabled={busy}
                    onClick={() => setCreating(true)}>
                    {T.profiles.create_profile}
                </Button>
                <Button variant="secondary" icon={<SyncAltIcon />} onClick={reload} isDisabled={busy}>
                    {T.common.refresh}
                </Button>
            </div>

            <Table aria-label={T.common.profiles} variant="compact">
                <Thead>
                    <Tr>
                        <Th modifier="nowrap">{T.common.name}</Th>
                        <Th modifier="nowrap">{T.common.description}</Th>
                        <Th>{T.common.devices}</Th>
                        <Th modifier="nowrap">{T.common.used_by}</Th>
                        <Th screenReaderText={T.common.actions} />
                    </Tr>
                </Thead>
                <Tbody>
                    {items.map((profile) => (
                        <Tr key={profile.name}>
                            <Td dataLabel={T.common.name}><strong>{profile.name}</strong></Td>
                            <Td dataLabel={T.common.description}>
                                {profile.description ||
                                    <span className="lxc-muted">{T.common.none}</span>}
                            </Td>
                            <Td dataLabel={T.common.devices}>{describeDevices(profile.devices)}</Td>
                            <Td dataLabel={T.common.used_by}>{profile.usedBy.length}</Td>
                            <Td isActionCell modifier="nowrap">
                                <div className="lxc-rowactions">
                                    <Button variant="secondary" isDisabled={busy}
                                        onClick={() => setEditing(profile)}>
                                        {T.common.edit}
                                    </Button>
                                    {/*
                                      * The default profile is what every
                                      * container falls back to, and Incus
                                      * refuses to delete it. Offering the
                                      * button would be offering a failure.
                                      */}
                                    <Button variant="link" isDanger
                                        isDisabled={busy || profile.name === "default"}
                                        onClick={() => setDeleting(profile)}>
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
                    title={T.profiles.create_profile}
                    existingName={null}
                    taken={items.map((p) => p.name)}
                    initial={{ description: "", config: {} }}
                    onClose={() => setCreating(false)}
                    onConfirm={async (name, _kind, update) => {
                        await run(() => driver.createProfile(name, update));
                        onChanged();
                    }}
                />
            )}

            {editing !== null && (
                <ResourceDialog
                    title={format(T.profiles.edit_profile, editing.name)}
                    existingName={editing.name}
                    taken={[]}
                    initial={{
                        description: editing.description,
                        config: editing.config,
                        devices: editing.devices,
                    }}
                    onClose={() => setEditing(null)}
                    onConfirm={async (_name, _kind, update) => {
                        // The devices go back untouched: this form edits config
                        // and description, and a PUT drops whatever it omits.
                        await run(() => driver.updateProfile(editing.name, {
                            ...update,
                            devices: editing.devices,
                        }));
                        onChanged();
                    }}
                />
            )}

            {deleting !== null && (
                <ConfirmDelete
                    title={format(T.profiles.delete_profile, deleting.name)}
                    body={T.profiles.the_profile_is_removed_containers_keep}
                    blocker={usedByBlocker(deleting.usedBy)}
                    onClose={() => setDeleting(null)}
                    onConfirm={async () => {
                        await run(() => driver.deleteProfile(deleting.name));
                        changed();
                    }}
                />
            )}
        </div>
    );
};
