import {
    Alert,
    Button,
    MenuToggle,
    SearchInput,
    Select,
    SelectList,
    SelectOption,
    Toolbar,
    ToolbarContent,
    ToolbarItem,
    type MenuToggleElement,
} from "@patternfly/react-core";
import { PlusCircleIcon, SyncAltIcon } from "@patternfly/react-icons";
import { Table, Tbody, Td, Th, Thead, Tr, type ThProps } from "@patternfly/react-table";
import { useMemo, useState } from "react";

import {
    K,
    _,
    format,
    type Container,
    type ContainerDriver,
    type ContainerState,
} from "../backend";
import { ContainerActions, type RowAction } from "../components/container-actions";
import { ContainerStateLabel, stateName } from "../components/container-state-label";
import {
    CopyDialog,
    CreateDialog,
    DeleteDialog,
    RenameDialog,
    type CreateSpec,
} from "./dialogs";
import { NoContainers } from "./startup-states";

type SortableColumn = "name" | "state" | "architecture" | "created";
type SortDirection = "asc" | "desc";

const STATE_FILTERS: readonly (ContainerState | "All")[] = [
    "All",
    "Running",
    "Stopped",
    "Frozen",
];

/** IPv4 first, then IPv6, and link-local last: it is never the useful one. */
const displayAddresses = (container: Container): string[] => {
    const addresses = container.interfaces.flatMap((iface) => iface.addresses);
    const rank = (scope: string, family: string): number =>
        scope === "link" ? 2 : family === "inet" ? 0 : 1;
    return [...addresses]
        .sort((a, b) => rank(a.scope, a.family) - rank(b.scope, b.family))
        .map((address) => address.address);
};

const formatCreated = (iso: string): string => {
    if (iso === "")
        return "";
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
};

const compare = (a: Container, b: Container, column: SortableColumn): number => {
    switch (column) {
        case "name":
            return a.name.localeCompare(b.name);
        case "state":
            return a.state.localeCompare(b.state);
        case "architecture":
            return a.architecture.localeCompare(b.architecture);
        case "created":
            return a.createdAt.localeCompare(b.createdAt);
    }
};

interface ContainerListProps {
    containers: Container[];
    driver: ContainerDriver;
    onRefresh: () => void;
    onOpen: (name: string) => void;
}

export const ContainerList = ({
    containers,
    driver,
    onRefresh,
    onOpen,
}: ContainerListProps) => {
    const [search, setSearch] = useState("");
    const [stateFilter, setStateFilter] = useState<ContainerState | "All">("All");
    const [filterOpen, setFilterOpen] = useState(false);
    const [sortColumn, setSortColumn] = useState<SortableColumn>("name");
    const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

    const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());
    const [actionError, setActionError] = useState<string | null>(null);
    const [deleting, setDeleting] = useState<Container | null>(null);
    const [renaming, setRenaming] = useState<Container | null>(null);
    const [copying, setCopying] = useState<Container | null>(null);
    const [creating, setCreating] = useState(false);

    const markBusy = (name: string, value: boolean) =>
        setBusy((current) => {
            const next = new Set(current);
            if (value)
                next.add(name);
            else
                next.delete(name);
            return next;
        });

    const runStateChange = async (container: Container, action: RowAction) => {
        markBusy(container.name, true);
        setActionError(null);
        try {
            switch (action) {
                case "start":
                    await driver.setState(container.name, "start");
                    break;
                case "stop":
                    await driver.setState(container.name, "stop");
                    break;
                case "force-stop":
                    // Explicitly separate from a graceful stop in the menu, so
                    // SIGKILL is never what a mis-click produces.
                    await driver.setState(container.name, "stop", { force: true });
                    break;
                case "restart":
                    await driver.setState(container.name, "restart");
                    break;
                case "freeze":
                    await driver.setState(container.name, "freeze");
                    break;
                case "unfreeze":
                    await driver.setState(container.name, "unfreeze");
                    break;
                default:
                    break;
            }
            onRefresh();
        } catch (error) {
            setActionError(error instanceof Error ? error.message : String(error));
        } finally {
            markBusy(container.name, false);
        }
    };

    const onAction = (container: Container, action: RowAction) => {
        if (action === "delete") {
            setDeleting(container);
            return;
        }
        if (action === "rename") {
            setRenaming(container);
            return;
        }
        if (action === "copy") {
            setCopying(container);
            return;
        }
        void runStateChange(container, action);
    };

    const visible = useMemo(() => {
        const needle = search.trim().toLowerCase();

        const filtered = containers.filter((container) => {
            if (stateFilter !== "All" && container.state !== stateFilter)
                return false;
            if (needle === "")
                return true;
            // Addresses are searchable too: an operator who has an IP and wants
            // the container behind it should not have to scan the column by eye.
            return (
                container.name.toLowerCase().includes(needle) ||
                container.description.toLowerCase().includes(needle) ||
                displayAddresses(container).some((a) => a.toLowerCase().includes(needle))
            );
        });

        const sorted = [...filtered].sort((a, b) => compare(a, b, sortColumn));
        return sortDirection === "asc" ? sorted : sorted.reverse();
    }, [containers, search, stateFilter, sortColumn, sortDirection]);

    // NonNullable because ThProps declares `sort` optional, and under
    // exactOptionalPropertyTypes handing back a possibly-undefined value is not
    // assignable to the prop.
    const sortParams = (
        column: SortableColumn,
        index: number,
    ): NonNullable<ThProps["sort"]> => ({
        sortBy: {
            index: sortColumn === column ? index : -1,
            direction: sortDirection,
            defaultDirection: "asc",
        },
        onSort: (_event, _index, direction) => {
            setSortColumn(column);
            setSortDirection(direction === "desc" ? "desc" : "asc");
        },
        columnIndex: index,
    });

    const dialogs = (
        <>
            {deleting !== null && (
                <DeleteDialog
                    container={deleting}
                    onClose={() => setDeleting(null)}
                    onConfirm={async () => {
                        await driver.deleteContainer(deleting.name);
                        onRefresh();
                    }}
                />
            )}
            {renaming !== null && (
                <RenameDialog
                    container={renaming}
                    onClose={() => setRenaming(null)}
                    onConfirm={async (newName) => {
                        await driver.renameContainer(renaming.name, newName);
                        onRefresh();
                    }}
                />
            )}
            {copying !== null && (
                <CopyDialog
                    container={copying}
                    existing={containers.map((c) => c.name)}
                    onClose={() => setCopying(null)}
                    onConfirm={async (newName) => {
                        await driver.copyContainer(copying.name, newName);
                        onRefresh();
                    }}
                />
            )}
            {creating && (
                <CreateDialog
                    existing={containers.map((c) => c.name)}
                    onClose={() => setCreating(false)}
                    onConfirm={async (spec: CreateSpec) => {
                        await driver.createContainer({
                            name: spec.name,
                            image: spec.image,
                            remote: spec.remote,
                            profiles: [],
                            config: {},
                            ephemeral: false,
                            start: spec.start,
                        });
                        onRefresh();
                    }}
                />
            )}
        </>
    );

    if (containers.length === 0) {
        return (
            <>
                <NoContainers onRefresh={onRefresh} onCreate={() => setCreating(true)} />
                {dialogs}
            </>
        );
    }

    return (
        <>
            {actionError !== null && (
                <Alert
                    variant="danger"
                    isInline
                    title={actionError}
                    actionClose={
                        <Button variant="plain" onClick={() => setActionError(null)}
                            aria-label={_(K.container_list.dismiss_error)}>
                            &times;
                        </Button>
                    }
                    className="lxc-action-error"
                />
            )}

            <Toolbar id="lxc-container-toolbar" className="lxc-page__toolbar-wrap">
                <ToolbarContent>
                    <ToolbarItem>
                        <Button variant="primary" icon={<PlusCircleIcon />}
                            onClick={() => setCreating(true)}>
                            {_(K.container_list.create_container)}
                        </Button>
                    </ToolbarItem>
                    <ToolbarItem>
                        <SearchInput
                            aria-label={_(K.container_list.search_containers_by_name_description_or)}
                            placeholder={_(K.container_list.search_containers)}
                            value={search}
                            onChange={(_event, value) => setSearch(value)}
                            onClear={() => setSearch("")}
                        />
                    </ToolbarItem>
                    <ToolbarItem>
                        <Select
                            id="lxc-state-filter"
                            isOpen={filterOpen}
                            selected={stateFilter}
                            onSelect={(_event, value) => {
                                setStateFilter(value as ContainerState | "All");
                                setFilterOpen(false);
                            }}
                            onOpenChange={setFilterOpen}
                            toggle={(ref: React.Ref<MenuToggleElement>) => (
                                <MenuToggle
                                    ref={ref}
                                    onClick={() => setFilterOpen((open) => !open)}
                                    isExpanded={filterOpen}
                                >
                                    {stateFilter === "All" ? _(K.container_list.all_states) : stateName(stateFilter)}
                                </MenuToggle>
                            )}
                        >
                            <SelectList>
                                {STATE_FILTERS.map((option) => (
                                    <SelectOption key={option} value={option}>
                                        {option === "All" ? _(K.container_list.all_states) : stateName(option)}
                                    </SelectOption>
                                ))}
                            </SelectList>
                        </Select>
                    </ToolbarItem>
                    <ToolbarItem>
                        <Button variant="secondary" icon={<SyncAltIcon />} onClick={onRefresh}>
                            {_(K.container_list.refresh)}
                        </Button>
                    </ToolbarItem>
                    <ToolbarItem align={{ default: "alignEnd" }}>
                        <span className="lxc-count">
                            {format(_(K.container_list.of), visible.length, containers.length)}
                        </span>
                    </ToolbarItem>
                </ToolbarContent>
            </Toolbar>

            <Table aria-label={_(K.container_list.system_containers)} variant="compact">
                <Thead>
                    {/*
                      * nowrap on every header: a sortable Th puts its label in a
                      * button that the default layout is willing to truncate, and
                      * a column headed "N..." is worse than a wider table. The
                      * addresses column is left free to take the slack, since an
                      * IPv6 address is the only cell here that genuinely needs it.
                      */}
                    <Tr>
                        <Th modifier="nowrap" sort={sortParams("name", 0)}>{_(K.container_list.name)}</Th>
                        <Th modifier="nowrap" sort={sortParams("state", 1)}>{_(K.container_list.state)}</Th>
                        <Th>{_(K.container_list.addresses)}</Th>
                        <Th modifier="nowrap" sort={sortParams("architecture", 2)}>
                            {_(K.container_list.architecture)}
                        </Th>
                        <Th modifier="nowrap">{_(K.container_list.profiles)}</Th>
                        <Th modifier="nowrap" sort={sortParams("created", 3)}>{_(K.container_list.created)}</Th>
                        <Th screenReaderText={_(K.container_list.actions)} />
                    </Tr>
                </Thead>
                <Tbody>
                    {visible.map((container) => (
                        <Tr key={container.name}>
                            <Td dataLabel={_(K.container_list.name)}>
                                {/*
                                  * A button rather than a link: this changes a
                                  * view rather than navigating to a URL, so a
                                  * link would offer a middle-click that leads
                                  * nowhere.
                                  */}
                                <Button
                                    variant="link"
                                    isInline
                                    onClick={() => onOpen(container.name)}
                                    className="lxc-row__name"
                                >
                                    {container.name}
                                </Button>
                                {container.description !== "" && (
                                    <div className="lxc-row__description">
                                        {container.description}
                                    </div>
                                )}
                            </Td>
                            <Td dataLabel={_(K.container_list.state)}>
                                <ContainerStateLabel state={container.state} />
                            </Td>
                            <Td dataLabel={_(K.container_list.addresses)}>
                                {displayAddresses(container).length === 0
                                    ? <span className="lxc-muted">{_(K.container_list.none)}</span>
                                    : (
                                        <ul className="lxc-address-list">
                                            {displayAddresses(container).map((address) => (
                                                <li key={address}>{address}</li>
                                            ))}
                                        </ul>
                                    )}
                            </Td>
                            <Td dataLabel={_(K.container_list.architecture)}>{container.architecture}</Td>
                            <Td dataLabel={_(K.container_list.profiles)}>{container.profiles.join(", ")}</Td>
                            <Td dataLabel={_(K.container_list.created)}>{formatCreated(container.createdAt)}</Td>
                            <Td isActionCell>
                                <ContainerActions
                                    container={container}
                                    busy={busy.has(container.name)}
                                    onAction={(action) => onAction(container, action)}
                                />
                            </Td>
                        </Tr>
                    ))}
                    {visible.length === 0 && (
                        <Tr>
                            <Td colSpan={7}>
                                <span className="lxc-muted">
                                    {_(K.container_list.no_container_matches_the_current_filter)}
                                </span>
                            </Td>
                        </Tr>
                    )}
                </Tbody>
            </Table>

            {dialogs}
        </>
    );
};
