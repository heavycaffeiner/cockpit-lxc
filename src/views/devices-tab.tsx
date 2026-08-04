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
    title: "Network interfaces",
    description:
        "Interfaces attached to this container. An interface supplied by a profile is " +
        "shown as inherited; adding one here with the same name overrides it.",
    addLabel: "Add interface",
    defaults: { type: "nic", network: "incusbr0", name: "eth0" },
    fields: [
        { key: "network", label: "Network", help: "A managed Incus network, such as incusbr0.", required: true },
        { key: "name", label: "Name in container", help: "The interface name the container sees.", placeholder: "eth0" },
        { key: "hwaddr", label: "MAC address", help: "Leave empty to let Incus generate one.", placeholder: "00:16:3e:aa:bb:cc" },
        { key: "mtu", label: "MTU", help: "Leave empty to inherit from the network." },
        { key: "ipv4.address", label: "IPv4 address", help: "A fixed address on the network's subnet." },
        { key: "ipv6.address", label: "IPv6 address", help: "A fixed IPv6 address." },
    ],
};

export const DISK_SPEC: DeviceKindSpec = {
    type: "disk",
    title: "Disks and mounts",
    description:
        "The root disk and any host paths bound into the container. Removing the root " +
        "disk leaves the container unable to start.",
    addLabel: "Add mount",
    defaults: { type: "disk" },
    fields: [
        { key: "source", label: "Source", help: "A host path, or a storage volume name.", required: true },
        { key: "path", label: "Path in container", help: "Where it appears inside the container.", placeholder: "/mnt/data" },
        { key: "pool", label: "Storage pool", help: "Only for volumes, not for host paths." },
        { key: "size", label: "Size", help: "Only meaningful on the root disk.", placeholder: "10GiB" },
        { key: "readonly", label: "Read only", help: "Set to true to mount without write access." },
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
                    "Another session changed this container while you were editing. " +
                    "Reload to see the current devices; nothing here has been saved.",
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
                    title="This container changed elsewhere while you were editing. Saving will be refused rather than overwrite it."
                />
            )}
            {rootDiskRemoved && (
                <Alert
                    variant="warning"
                    isInline
                    title="No root disk remains. Incus refuses to start a container without one."
                />
            )}

            <p className="lxc-config__description">{spec.description}</p>

            {inheritedDevices.length > 0 && (
                <Card isPlain className="lxc-devices__inherited">
                    <CardTitle>Inherited from profiles</CardTitle>
                    <CardBody>
                        {inheritedDevices.map(([name, device]) => (
                            <DescriptionList key={name} isHorizontal isCompact>
                                <DescriptionListGroup>
                                    <DescriptionListTerm>
                                        {name} <Label isCompact color="grey">inherited</Label>
                                    </DescriptionListTerm>
                                    <DescriptionListDescription>
                                        {Object.entries(device)
                                            .filter(([key]) => key !== "type")
                                            .map(([key, value]) => `${key}=${value}`)
                                            .join("  ") || "no settings"}
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
                                    aria-label={`Remove ${name}`}
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
                                        aria-label={`${field.label} for ${name}`}
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
                        Nothing of this kind is set on the container itself.
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
                        Save
                    </Button>
                    <Button variant="link" isDisabled={!dirty || busy} onClick={discard}>
                        Discard changes
                    </Button>
                </ActionGroup>
            </Form>
        </div>
    );
};
