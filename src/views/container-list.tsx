import {
    Button,
    SearchInput,
    Select,
    SelectList,
    SelectOption,
    Toolbar,
    ToolbarContent,
    ToolbarItem,
    MenuToggle,
    type MenuToggleElement,
} from "@patternfly/react-core";
import { SyncAltIcon } from "@patternfly/react-icons";
import { Table, Tbody, Td, Th, Thead, Tr, type ThProps } from "@patternfly/react-table";
import { useMemo, useState } from "react";

import type { Container, ContainerState } from "../backend";
import { ContainerStateLabel } from "../components/container-state-label";
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
    const rank = (scope: string, family: string): number => {
        if (scope === "link")
            return 2;
        return family === "inet" ? 0 : 1;
    };
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
    onRefresh: () => void;
}

export const ContainerList = ({ containers, onRefresh }: ContainerListProps) => {
    const [search, setSearch] = useState("");
    const [stateFilter, setStateFilter] = useState<ContainerState | "All">("All");
    const [filterOpen, setFilterOpen] = useState(false);
    const [sortColumn, setSortColumn] = useState<SortableColumn>("name");
    const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

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

    if (containers.length === 0)
        return <NoContainers onRefresh={onRefresh} />;

    return (
        <>
            <Toolbar id="lxc-container-toolbar" className="lxc-page__toolbar-wrap">
                <ToolbarContent>
                    <ToolbarItem>
                        <SearchInput
                            aria-label="Search containers by name, description or address"
                            placeholder="Search containers"
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
                                    {stateFilter === "All" ? "All states" : stateFilter}
                                </MenuToggle>
                            )}
                        >
                            <SelectList>
                                {STATE_FILTERS.map((option) => (
                                    <SelectOption key={option} value={option}>
                                        {option === "All" ? "All states" : option}
                                    </SelectOption>
                                ))}
                            </SelectList>
                        </Select>
                    </ToolbarItem>
                    <ToolbarItem>
                        <Button
                            variant="secondary"
                            icon={<SyncAltIcon />}
                            onClick={onRefresh}
                        >
                            Refresh
                        </Button>
                    </ToolbarItem>
                    <ToolbarItem align={{ default: "alignEnd" }}>
                        <span className="lxc-count">
                            {visible.length} of {containers.length}
                        </span>
                    </ToolbarItem>
                </ToolbarContent>
            </Toolbar>

            <Table aria-label="System containers" variant="compact">
                <Thead>
                    {/*
                      * nowrap on every header: a sortable Th puts its label in a
                      * button that the default layout is willing to truncate, and
                      * a column headed "N..." is worse than a wider table. The
                      * addresses column is left free to take the slack, since an
                      * IPv6 address is the only cell here that genuinely needs it.
                      */}
                    <Tr>
                        <Th modifier="nowrap" sort={sortParams("name", 0)}>Name</Th>
                        <Th modifier="nowrap" sort={sortParams("state", 1)}>State</Th>
                        <Th>Addresses</Th>
                        <Th modifier="nowrap" sort={sortParams("architecture", 2)}>
                            Architecture
                        </Th>
                        <Th modifier="nowrap">Profiles</Th>
                        <Th modifier="nowrap" sort={sortParams("created", 3)}>Created</Th>
                    </Tr>
                </Thead>
                <Tbody>
                    {visible.map((container) => (
                        <Tr key={container.name}>
                            <Td dataLabel="Name">
                                <strong>{container.name}</strong>
                                {container.description !== "" && (
                                    <div className="lxc-row__description">
                                        {container.description}
                                    </div>
                                )}
                            </Td>
                            <Td dataLabel="State">
                                <ContainerStateLabel state={container.state} />
                            </Td>
                            <Td dataLabel="Addresses">
                                {displayAddresses(container).length === 0
                                    ? <span className="lxc-muted">None</span>
                                    : (
                                        <ul className="lxc-address-list">
                                            {displayAddresses(container).map((address) => (
                                                <li key={address}>{address}</li>
                                            ))}
                                        </ul>
                                    )}
                            </Td>
                            <Td dataLabel="Architecture">{container.architecture}</Td>
                            <Td dataLabel="Profiles">{container.profiles.join(", ")}</Td>
                            <Td dataLabel="Created">{formatCreated(container.createdAt)}</Td>
                        </Tr>
                    ))}
                    {visible.length === 0 && (
                        <Tr>
                            <Td colSpan={6}>
                                <span className="lxc-muted">
                                    No container matches the current filter.
                                </span>
                            </Td>
                        </Tr>
                    )}
                </Tbody>
            </Table>
        </>
    );
};
