import {
    ActionGroup,
    Alert,
    Button,
    Card,
    CardBody,
    CardTitle,
    DescriptionList,
    DescriptionListDescription,
    DescriptionListGroup,
    DescriptionListTerm,
    Form,
    FormGroup,
    FormHelperText,
    HelperText,
    HelperTextItem,
    Label,
    TextInput,
} from "@patternfly/react-core";
import { PlusCircleIcon, TrashIcon } from "@patternfly/react-icons";
import { useMemo, useState } from "react";

import {
    ConflictError,
    T,
    format,
    type Container,
    type ContainerDriver,
    type ContainerUpdate,
} from "../backend";

type DeviceMap = Record<string, Record<string, string>>;

interface DeviceFieldSpec {
    key: string;
    label: string;
    help: string;
    placeholder?: string;
    required?: boolean;
}

interface DeviceKindSpec {
    type: string;
    title: string;
    description: string;
    addLabel: string;
    defaults: Record<string, string>;
    fields: readonly DeviceFieldSpec[];
}

export const NIC_SPEC: DeviceKindSpec = {
    type: "nic",
    title: T.devices.network_interfaces,
    description: T.devices.interfaces_attached_to_this_container_an,
    addLabel: T.devices.add_interface,
    defaults: { type: "nic", network: "incusbr0", name: "eth0" },
    fields: [
        {
            key: "network",
            label: T.common.network,
            help: T.devices.a_managed_incus_network_such_as,
            required: true,
        },
        {
            key: "name",
            label: T.devices.name_in_container,
            help: T.devices.the_interface_name_the_container_sees,
            placeholder: "eth0",
        },
        {
            key: "hwaddr",
            label: T.devices.mac_address,
            help: T.devices.leave_empty_to_let_incus_generate,
            placeholder: "00:16:3e:aa:bb:cc",
        },
        {
            key: "mtu",
            label: T.devices.mtu,
            help: T.devices.leave_empty_to_inherit_from_the,
        },
        {
            key: "ipv4.address",
            label: T.devices.ipv4_address,
            help: T.devices.a_fixed_address_on_the_networks,
        },
        {
            key: "ipv6.address",
            label: T.devices.ipv6_address,
            help: T.devices.a_fixed_ipv6_address,
        },
    ],
};

export const DISK_SPEC: DeviceKindSpec = {
    type: "disk",
    title: T.devices.disks_and_mounts,
    description: T.devices.the_root_disk_and_any_host,
    addLabel: T.devices.add_mount,
    defaults: { type: "disk" },
    fields: [
        {
            key: "source",
            label: T.common.source,
            help: T.devices.a_host_path_or_a_storage,
            required: true,
        },
        {
            key: "path",
            label: T.devices.path_in_container,
            help: T.devices.where_it_appears_inside_the_container,
            placeholder: "/mnt/data",
        },
        {
            key: "pool",
            label: T.devices.storage_pool,
            help: T.devices.only_for_volumes_not_for_host,
        },
        {
            key: "size",
            label: T.common.size,
            help: T.devices.only_meaningful_on_the_root_disk,
            placeholder: "10GiB",
        },
        {
            key: "readonly",
            label: T.devices.read_only,
            help: T.devices.set_to_true_to_mount_without,
        },
    ],
};

interface DevicesTabProps {
    spec: DeviceKindSpec;
    container: Container;
    etag: string | null;
    driver: ContainerDriver;
    onSaved: () => void;
}

const errorText = (error: unknown): string =>
    error instanceof Error ? error.message : String(error);

export const DevicesTab = ({ spec, container, etag, driver, onSaved }: DevicesTabProps) => {
    const [devices, setDevices] = useState<DeviceMap | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [conflict, setConflict] = useState<string | null>(null);

    /*
     * The ETag from when this edit started, pinned on the first change.
     *
     * The live event stream refetches the instance whenever anything changes it,
     * including a change from another session. Saving with the refreshed ETag
     * would succeed and overwrite exactly the change the operator needed to know
     * about, so the precondition stays tied to what was on screen.
     */
    const [baseEtag, setBaseEtag] = useState<string | null>(null);
    const [pinned, setPinned] = useState(false);

    const local = devices ?? container.localDevices;
    const saveEtag = pinned ? baseEtag : etag;

    /*
     * Devices from a profile are shown but not edited here. Editing one would
     * have to copy it onto the instance, and doing that silently to something
     * the operator did not add is how a profile change stops reaching a
     * container without anyone noticing.
     */
    const inheritedDevices = useMemo(() => {
        return Object.entries(container.devices)
            .filter(([name, device]) => device["type"] === spec.type && local[name] === undefined);
    }, [container.devices, local, spec.type]);

    const ownDevices = useMemo(
        () => Object.entries(local).filter(([, device]) => device["type"] === spec.type),
        [local, spec.type],
    );

    const dirty = devices !== null;
    const movedUnderEdit = dirty && pinned && baseEtag !== etag;

    const mutate = (next: DeviceMap) => {
        if (!pinned) {
            setBaseEtag(etag);
            setPinned(true);
        }
        setDevices(next);
    };

    const discard = () => {
        setDevices(null);
        setPinned(false);
        setBaseEtag(null);
        setError(null);
        setConflict(null);
    };

    const save = async () => {
        if (saveEtag === null || devices === null)
            return;
        setBusy(true);
        setError(null);
        setConflict(null);
        const update: ContainerUpdate = {
            architecture: container.architecture,
            description: container.description,
            ephemeral: container.ephemeral,
            profiles: container.profiles,
            config: container.localConfig,
            devices,
        };
        try {
            await driver.updateConfig(container.name, update, saveEtag);
            discard();
            onSaved();
        } catch (caught) {
            if (caught instanceof ConflictError) {
                setConflict(
                    T.devices.another_session_changed_this_container_while,
                );
            } else {
                setError(errorText(caught));
            }
        } finally {
            setBusy(false);
        }
    };

    const rootDiskRemoved =
        spec.type === "disk" &&
        dirty &&
        Object.values(container.devices).some((d) => d["type"] === "disk" && d["path"] === "/") &&
        !Object.values(local).some((d) => d["type"] === "disk" && d["path"] === "/") &&
        !inheritedDevices.some(([, d]) => d["path"] === "/");

    return (
        <div className="lxc-devices">
            {error !== null && <Alert variant="danger" isInline title={error} />}
            {conflict !== null && <Alert variant="warning" isInline title={conflict} />}
            {movedUnderEdit && (
                <Alert
                    variant="info"
                    isInline
                    title={T.devices.this_container_changed_elsewhere_while_you}
                />
            )}
            {rootDiskRemoved && (
                <Alert
                    variant="warning"
                    isInline
                    title={T.devices.no_root_disk_remains_incus_refuses}
                />
            )}

            <p className="lxc-config__description">{spec.description}</p>

            {inheritedDevices.length > 0 && (
                <Card isPlain className="lxc-devices__inherited">
                    <CardTitle>{T.devices.inherited_from_profiles}</CardTitle>
                    <CardBody>
                        {inheritedDevices.map(([name, device]) => (
                            <DescriptionList key={name} isHorizontal isCompact>
                                <DescriptionListGroup>
                                    <DescriptionListTerm>
                                        {name} <Label isCompact color="grey">{T.devices.inherited}</Label>
                                    </DescriptionListTerm>
                                    <DescriptionListDescription>
                                        {Object.entries(device)
                                            .filter(([key]) => key !== "type")
                                            .map(([key, value]) => `${key}=${value}`)
                                            .join("  ") || T.devices.no_settings}
                                    </DescriptionListDescription>
                                </DescriptionListGroup>
                            </DescriptionList>
                        ))}
                    </CardBody>
                </Card>
            )}

            <Form
                onSubmit={(event) => {
                    event.preventDefault();
                    if (dirty && saveEtag !== null)
                        void save();
                }}
            >
                {ownDevices.map(([name, device]) => (
                    <Card key={name} className="lxc-devices__card">
                        <CardTitle>
                            <div className="lxc-devices__cardhead">
                                <span>{name}</span>
                                <Button
                                    variant="plain"
                                    icon={<TrashIcon />}
                                    aria-label={format(T.devices.remove, name)}
                                    onClick={() => {
                                        const next = { ...local };
                                        delete next[name];
                                        mutate(next);
                                    }}
                                />
                            </div>
                        </CardTitle>
                        <CardBody>
                            {spec.fields.map((field) => (
                                <FormGroup
                                    key={field.key}
                                    label={field.label}
                                    fieldId={`lxc-dev-${name}-${field.key}`}
                                    isRequired={field.required ?? false}
                                >
                                    <TextInput
                                        id={`lxc-dev-${name}-${field.key}`}
                                        value={device[field.key] ?? ""}
                                        placeholder={field.placeholder ?? ""}
                                        aria-label={format(T.devices.for, field.label, name)}
                                        onChange={(_event, value) => {
                                            const nextDevice = { ...device };
                                            if (value === "")
                                                delete nextDevice[field.key];
                                            else
                                                nextDevice[field.key] = value;
                                            mutate({ ...local, [name]: nextDevice });
                                        }}
                                    />
                                    <FormHelperText>
                                        <HelperText>
                                            <HelperTextItem>{field.help}</HelperTextItem>
                                        </HelperText>
                                    </FormHelperText>
                                </FormGroup>
                            ))}
                        </CardBody>
                    </Card>
                ))}

                {ownDevices.length === 0 && (
                    <p className="lxc-muted">
                        {T.devices.nothing_of_this_kind_is_set}
                    </p>
                )}

                <Button
                    variant="link"
                    icon={<PlusCircleIcon />}
                    onClick={() => {
                        let index = 0;
                        let name = `${spec.type}${index}`;
                        while (local[name] !== undefined || container.devices[name] !== undefined) {
                            index += 1;
                            name = `${spec.type}${index}`;
                        }
                        mutate({ ...local, [name]: { ...spec.defaults } });
                    }}
                >
                    {spec.addLabel}
                </Button>

                <ActionGroup>
                    <Button
                        variant="primary"
                        isDisabled={!dirty || busy || saveEtag === null}
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
        </div>
    );
};
