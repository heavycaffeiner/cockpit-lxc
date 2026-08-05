import { Alert, Button, Label, Spinner } from "@patternfly/react-core";
import { PlusCircleIcon, SyncAltIcon } from "@patternfly/react-icons";
import { Table, Tbody, Td, Th, Thead, Tr } from "@patternfly/react-table";
import { useCallback, useState } from "react";

import { T, format, type ContainerDriver, type Network } from "../backend";
import { ConfirmDelete, ResourceDialog, usedByBlocker } from "../components/resource-dialog";
import { useResourceList } from "../hooks/use-resource-list";

/**
 * The network types Incus can create on a single, non-clustered host.
 *
 * Deliberately not the full list: OVN needs a configured uplink and a running
 * OVN cluster, and offering it on a host that has neither produces a failure at
 * submit time rather than a network.
 */
const NETWORK_TYPES = () => [
    { value: "bridge", label: T.networks.bridge },
    { value: "macvlan", label: T.networks.macvlan },
    { value: "sriov", label: T.networks.sriov },
];

interface NetworksViewProps {
    driver: ContainerDriver;
    onChanged: () => void;
}

export const NetworksView = ({ driver, onChanged }: NetworksViewProps) => {
    const load = useCallback(() => driver.listNetworks(), [driver]);
    const { items, error, busy, reload, run } = useResourceList<Network>(load);

    const [creating, setCreating] = useState(false);
    const [editing, setEditing] = useState<Network | null>(null);
    const [deleting, setDeleting] = useState<Network | null>(null);

    if (items === null)
        return <Spinner aria-label={T.networks.loading_networks} />;

    return (
        <div className="lxc-resource">
            {error !== null && <Alert variant="danger" isInline title={error} />}

            <p className="lxc-config__description">
                {T.networks.managed_networks_are_created_and_maintained}
            </p>

            <div className="lxc-page__toolbar">
                <Button variant="primary" icon={<PlusCircleIcon />} isDisabled={busy}
                    onClick={() => setCreating(true)}>
                    {T.networks.create_network}
                </Button>
                <Button variant="secondary" icon={<SyncAltIcon />} onClick={reload} isDisabled={busy}>
                    {T.common.refresh}
                </Button>
            </div>

            <Table aria-label={T.common.networks} variant="compact">
                <Thead>
                    <Tr>
                        <Th modifier="nowrap">{T.common.name}</Th>
                        <Th modifier="nowrap">{T.common.type}</Th>
                        <Th modifier="nowrap">{T.networks.managed}</Th>
                        <Th>{T.common.addresses}</Th>
                        <Th modifier="nowrap">{T.common.used_by}</Th>
                        <Th screenReaderText={T.common.actions} />
                    </Tr>
                </Thead>
                <Tbody>
                    {items.map((network) => {
                        const ipv4 = network.config["ipv4.address"];
                        const ipv6 = network.config["ipv6.address"];
                        return (
                            <Tr key={network.name}>
                                <Td dataLabel={T.common.name}><strong>{network.name}</strong></Td>
                                <Td dataLabel={T.common.type}>{network.type}</Td>
                                <Td dataLabel={T.networks.managed}>
                                    {network.managed
                                        ? <Label isCompact color="green">{T.networks.managed}</Label>
                                        : <Label isCompact color="grey">{T.networks.unmanaged}</Label>}
                                </Td>
                                <Td dataLabel={T.common.addresses}>
                                    {ipv4 !== undefined && <div>{ipv4}</div>}
                                    {ipv6 !== undefined && <div>{ipv6}</div>}
                                    {ipv4 === undefined && ipv6 === undefined && (
                                        <span className="lxc-muted">{T.common.none}</span>
                                    )}
                                </Td>
                                <Td dataLabel={T.common.used_by}>{network.usedBy.length}</Td>
                                <Td isActionCell modifier="nowrap">
                                    {/*
                                      * An unmanaged network is a host interface
                                      * Incus does not own. Editing or deleting
                                      * it here would be editing the host's
                                      * network configuration, which section 3.2
                                      * puts out of scope.
                                      */}
                                    <div className="lxc-rowactions">
                                        <Button variant="secondary"
                                            isDisabled={busy || !network.managed}
                                            onClick={() => setEditing(network)}>
                                            {T.common.edit}
                                        </Button>
                                        <Button variant="link" isDanger
                                            isDisabled={busy || !network.managed}
                                            onClick={() => setDeleting(network)}>
                                            {T.common.delete}
                                        </Button>
                                    </div>
                                </Td>
                            </Tr>
                        );
                    })}
                </Tbody>
            </Table>

            {creating && (
                <ResourceDialog
                    title={T.networks.create_network}
                    existingName={null}
                    taken={items.map((n) => n.name)}
                    initial={{ description: "", config: {} }}
                    kind={{
                        label: T.common.type,
                        help: T.networks.a_bridge_is_the_usual_choice,
                        options: NETWORK_TYPES(),
                    }}
                    onClose={() => setCreating(false)}
                    onConfirm={async (name, kind, update) => {
                        await run(() => driver.createNetwork(name, kind, update));
                        onChanged();
                    }}
                />
            )}

            {editing !== null && (
                <ResourceDialog
                    title={format(T.networks.edit_network, editing.name)}
                    existingName={editing.name}
                    taken={[]}
                    initial={{ description: editing.description, config: editing.config }}
                    onClose={() => setEditing(null)}
                    onConfirm={async (_name, _kind, update) => {
                        await run(() => driver.updateNetwork(editing.name, update));
                        onChanged();
                    }}
                />
            )}

            {deleting !== null && (
                <ConfirmDelete
                    title={format(T.networks.delete_network, deleting.name)}
                    body={T.networks.the_network_and_its_bridge_are}
                    blocker={usedByBlocker(deleting.usedBy)}
                    onClose={() => setDeleting(null)}
                    onConfirm={async () => {
                        await run(() => driver.deleteNetwork(deleting.name));
                        onChanged();
                    }}
                />
            )}
        </div>
    );
};
