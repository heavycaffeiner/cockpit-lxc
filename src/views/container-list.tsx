import {
    Alert,
    Button,
    Checkbox,
    MenuToggle,
    Modal,
    ModalBody,
    ModalFooter,
    ModalHeader,
    Pagination,
    SearchInput,
    Select,
    SelectList,
    SelectOption,
    Switch,
    Toolbar,
    ToolbarContent,
    ToolbarItem,
    type MenuToggleElement,
} from "@patternfly/react-core";
import { PlusCircleIcon, SyncAltIcon } from "@patternfly/react-icons";
import { Table, Tbody, Td, Th, Thead, Tr, type ThProps } from "@patternfly/react-table";
import { useMemo, useState } from "react";

import {
    T,
    format,
    type Container,
    type ContainerDriver,
    type ContainerState,
} from "../backend";
import { ContainerActions, labels as actionLabels, type RowAction } from "../components/container-actions";
import { ContainerStateLabel, stateName } from "../components/container-state-label";
import { announce } from "../components/live-region";
import type { Prefs } from "../prefs";
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

/** Columns the operator can turn off. Name, state and actions always show. */
const OPTIONAL_COLUMNS = ["addresses", "architecture", "profiles", "autostart", "created"] as const;
type OptionalColumn = typeof OPTIONAL_COLUMNS[number];

/** Bulk actions, and the state a container has to be in for each to apply. */
const BULK_ACTIONS = [
    { action: "start", applies: (c: Container) => c.state === "Stopped" },
    { action: "stop", applies: (c: Container) => c.state === "Running" },
    { action: "restart", applies: (c: Container) => c.state === "Running" },
] as const;

type BulkAction = typeof BULK_ACTIONS[number]["action"];

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

const errorText = (error: unknown): string =>
    error instanceof Error ? error.message : String(error);

const applies = (action: BulkAction, container: Container): boolean =>
    BULK_ACTIONS.find((entry) => entry.action === action)?.applies(container) ?? false;

interface ContainerListProps {
    containers: Container[];
    driver: ContainerDriver;
    prefs: Prefs;
    onPrefsChange: (patch: Partial<Prefs>) => void;
    onRefresh: () => void;
    onOpen: (name: string) => void;
}

export const ContainerList = ({
    containers,
    driver,
    prefs,
    onPrefsChange,
    onRefresh,
    onOpen,
}: ContainerListProps) => {
    const [search, setSearch] = useState("");
    const [stateFilter, setStateFilter] = useState<ContainerState | "All">("All");
    const [filterOpen, setFilterOpen] = useState(false);
    const [columnsOpen, setColumnsOpen] = useState(false);
    const [page, setPage] = useState(1);

    const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set());
    const [bulk, setBulk] = useState<BulkAction | null>(null);

    const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());
    const [actionError, setActionError] = useState<string | null>(null);
    const [deleting, setDeleting] = useState<Container | null>(null);
    const [renaming, setRenaming] = useState<Container | null>(null);
    const [copying, setCopying] = useState<Container | null>(null);
    const [creating, setCreating] = useState(false);

    const sortColumn = prefs.sortColumn as SortableColumn;
    const sortDirection: SortDirection = prefs.sortDirection;
    const hidden = useMemo(() => new Set(prefs.hiddenColumns), [prefs.hiddenColumns]);
    const shows = (column: OptionalColumn) => !hidden.has(column);

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
            // The row's label changes and nothing else does, so a screen reader
            // would otherwise get silence for an operation that took seconds.
            announce(format(T.list.finished_on, actionLabels()[action], container.name));
            onRefresh();
        } catch (error) {
            setActionError(errorText(error));
            announce(format(T.list.failed_on, actionLabels()[action], container.name));
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

    /**
     * Autostart, toggled straight from the row.
     *
     * PATCH rather than PUT: this touches one key, and a merge of disjoint keys
     * cannot clobber a concurrent edit, so it needs no ETag round trip. PUT
     * would have to send the whole instance back to change a boolean.
     */
    const toggleAutostart = async (container: Container, next: boolean) => {
        markBusy(container.name, true);
        setActionError(null);
        try {
            await driver.patchConfig(container.name, { "boot.autostart": next ? "true" : "false" });
            announce(format(next ? T.list.autostart_on_for : T.list.autostart_off_for, container.name));
            onRefresh();
        } catch (error) {
            setActionError(errorText(error));
        } finally {
            markBusy(container.name, false);
        }
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

    // A filter or a deletion can leave the current page past the end of the
    // list, which would show an empty table with rows sitting behind it.
    const lastPage = Math.max(1, Math.ceil(visible.length / prefs.pageSize));
    const current = Math.min(page, lastPage);
    const rows = visible.slice((current - 1) * prefs.pageSize, current * prefs.pageSize);

    const selected = useMemo(
        () => visible.filter((container) => chosen.has(container.name)),
        [visible, chosen],
    );

    const toggleChosen = (name: string, value: boolean) =>
        setChosen((current2) => {
            const next = new Set(current2);
            if (value)
                next.add(name);
            else
                next.delete(name);
            return next;
        });

    /**
     * Apply one action to the whole selection.
     *
     * Containers the action cannot apply to are dropped rather than attempted:
     * starting an already-running container is an error Incus reports, and a
     * batch that half fails reads as a bug.
     */
    const runBulk = async (action: BulkAction) => {
        const targets = selected.filter((container) => applies(action, container));
        setActionError(null);

        for (const container of targets)
            await runStateChange(container, action);

        announce(format(T.list.finished_on_containers, actionLabels()[action], targets.length));
        setChosen(new Set());
    };

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
        onSort: (_event, _index, direction) => onPrefsChange({
            sortColumn: column,
            sortDirection: direction === "desc" ? "desc" : "asc",
        }),
        columnIndex: index,
    });

    const columnLabel: Record<OptionalColumn, string> = {
        addresses: T.common.addresses,
        architecture: T.common.architecture,
        profiles: T.common.profiles,
        autostart: T.list.autostart,
        created: T.common.created,
    };

    const dialogs = (
        <>
            {deleting !== null && (
                <DeleteDialog
                    container={deleting}
                    onClose={() => setDeleting(null)}
                    onConfirm={async () => {
                        await driver.deleteContainer(deleting.name);
                        announce(format(T.list.deleted, deleting.name));
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
                        announce(format(T.list.created, spec.name));
                        onRefresh();
                    }}
                />
            )}
            {bulk !== null && (
                <BulkConfirmDialog
                    action={bulk}
                    targets={selected.filter((container) => applies(bulk, container))}
                    skipped={selected.filter((container) => !applies(bulk, container))}
                    onClose={() => setBulk(null)}
                    onConfirm={() => runBulk(bulk)}
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

    const allChosen = rows.length > 0 && rows.every((c) => chosen.has(c.name));

    return (
        <>
            {actionError !== null && (
                <Alert
                    variant="danger"
                    isInline
                    title={actionError}
                    actionClose={
                        <Button variant="plain" onClick={() => setActionError(null)}
                            aria-label={T.list.dismiss_error}>
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
                            {T.list.create_container}
                        </Button>
                    </ToolbarItem>
                    <ToolbarItem>
                        <SearchInput
                            aria-label={T.list.search_containers_by_name_description_or}
                            placeholder={T.list.search_containers}
                            value={search}
                            onChange={(_event, value) => { setSearch(value); setPage(1); }}
                            onClear={() => { setSearch(""); setPage(1); }}
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
                                setPage(1);
                            }}
                            onOpenChange={setFilterOpen}
                            toggle={(ref: React.Ref<MenuToggleElement>) => (
                                <MenuToggle
                                    ref={ref}
                                    onClick={() => setFilterOpen((open) => !open)}
                                    isExpanded={filterOpen}
                                >
                                    {stateFilter === "All" ? T.list.all_states : stateName(stateFilter)}
                                </MenuToggle>
                            )}
                        >
                            <SelectList>
                                {STATE_FILTERS.map((option) => (
                                    <SelectOption key={option} value={option}>
                                        {option === "All" ? T.list.all_states : stateName(option)}
                                    </SelectOption>
                                ))}
                            </SelectList>
                        </Select>
                    </ToolbarItem>
                    <ToolbarItem>
                        <Select
                            id="lxc-column-picker"
                            isOpen={columnsOpen}
                            onOpenChange={setColumnsOpen}
                            toggle={(ref: React.Ref<MenuToggleElement>) => (
                                <MenuToggle
                                    ref={ref}
                                    onClick={() => setColumnsOpen((open) => !open)}
                                    isExpanded={columnsOpen}
                                >
                                    {T.list.columns}
                                </MenuToggle>
                            )}
                        >
                            <SelectList>
                                {OPTIONAL_COLUMNS.map((column) => (
                                    <SelectOption
                                        key={column}
                                        value={column}
                                        hasCheckbox
                                        isSelected={shows(column)}
                                        onClick={() => onPrefsChange({
                                            hiddenColumns: shows(column)
                                                ? [...prefs.hiddenColumns, column]
                                                : prefs.hiddenColumns.filter((c) => c !== column),
                                        })}
                                    >
                                        {columnLabel[column]}
                                    </SelectOption>
                                ))}
                            </SelectList>
                        </Select>
                    </ToolbarItem>
                    <ToolbarItem>
                        <Button variant="secondary" icon={<SyncAltIcon />} onClick={onRefresh}>
                            {T.common.refresh}
                        </Button>
                    </ToolbarItem>

                    {/*
                      * The bulk actions appear only once something is selected,
                      * rather than sitting there disabled. A control that is
                      * usually dead reads as broken.
                      */}
                    {selected.length > 0 && (
                        <ToolbarItem className="lxc-bulk">
                            <span className="lxc-count">
                                {format(T.list.selected, selected.length)}
                            </span>
                            {BULK_ACTIONS.map((entry) => (
                                <Button
                                    key={entry.action}
                                    variant="secondary"
                                    onClick={() => setBulk(entry.action)}
                                >
                                    {actionLabels()[entry.action]}
                                </Button>
                            ))}
                            <Button variant="link" onClick={() => setChosen(new Set())}>
                                {T.list.clear_selection}
                            </Button>
                        </ToolbarItem>
                    )}

                    <ToolbarItem align={{ default: "alignEnd" }}>
                        <Pagination
                            itemCount={visible.length}
                            perPage={prefs.pageSize}
                            page={current}
                            onSetPage={(_event, next) => setPage(next)}
                            onPerPageSelect={(_event, size) => {
                                onPrefsChange({ pageSize: size });
                                setPage(1);
                            }}
                            isCompact
                            titles={{ paginationAriaLabel: T.list.container_pages }}
                            /*
                             * PatternFly's own summary is English. Everything
                             * else on the page is translated, so leaving one
                             * untranslated line in the toolbar would read as a
                             * gap rather than as a component default.
                             */
                            toggleTemplate={({ firstIndex, lastIndex, itemCount }) => (
                                <span>
                                    {format(
                                        T.list.of_containers,
                                        firstIndex ?? 0,
                                        lastIndex ?? 0,
                                        itemCount ?? 0,
                                    )}
                                </span>
                            )}
                        />
                    </ToolbarItem>
                </ToolbarContent>
            </Toolbar>

            <Table aria-label={T.list.system_containers} variant="compact">
                <Thead>
                    {/*
                      * nowrap on every header: a sortable Th puts its label in a
                      * button that the default layout is willing to truncate, and
                      * a column headed "N..." is worse than a wider table. The
                      * addresses column is left free to take the slack, since an
                      * IPv6 address is the only cell here that genuinely needs it.
                      */}
                    <Tr>
                        <Th
                            select={{
                                onSelect: (_event, checked) =>
                                    setChosen(checked ? new Set(rows.map((c) => c.name)) : new Set()),
                                isSelected: allChosen,
                            }}
                            aria-label={T.list.select_every_container_on_this_page}
                        />
                        <Th modifier="nowrap" sort={sortParams("name", 1)}>{T.common.name}</Th>
                        <Th modifier="nowrap" sort={sortParams("state", 2)}>{T.common.state}</Th>
                        {shows("addresses") && <Th>{T.common.addresses}</Th>}
                        {shows("architecture") && (
                            <Th modifier="nowrap" sort={sortParams("architecture", 3)}>
                                {T.common.architecture}
                            </Th>
                        )}
                        {shows("profiles") && <Th modifier="nowrap">{T.common.profiles}</Th>}
                        {shows("autostart") && <Th modifier="nowrap">{T.list.autostart}</Th>}
                        {shows("created") && (
                            <Th modifier="nowrap" sort={sortParams("created", 4)}>{T.common.created}</Th>
                        )}
                        <Th screenReaderText={T.common.actions} />
                    </Tr>
                </Thead>
                <Tbody>
                    {rows.map((container) => (
                        <Tr key={container.name}>
                            <Td>
                                <Checkbox
                                    id={`lxc-select-${container.name}`}
                                    aria-label={format(T.list.select, container.name)}
                                    isChecked={chosen.has(container.name)}
                                    onChange={(_event, checked) =>
                                        toggleChosen(container.name, checked)}
                                />
                            </Td>
                            <Td dataLabel={T.common.name}>
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
                            <Td dataLabel={T.common.state}>
                                <ContainerStateLabel state={container.state} />
                            </Td>
                            {shows("addresses") && (
                                <Td dataLabel={T.common.addresses}>
                                    {displayAddresses(container).length === 0
                                        ? <span className="lxc-muted">{T.common.none}</span>
                                        : (
                                            <ul className="lxc-address-list">
                                                {displayAddresses(container).map((address) => (
                                                    <li key={address}>{address}</li>
                                                ))}
                                            </ul>
                                        )}
                                </Td>
                            )}
                            {shows("architecture") && (
                                <Td dataLabel={T.common.architecture}>{container.architecture}</Td>
                            )}
                            {shows("profiles") && (
                                <Td dataLabel={T.common.profiles}>{container.profiles.join(", ")}</Td>
                            )}
                            {shows("autostart") && (
                                <Td dataLabel={T.list.autostart}>
                                    <Switch
                                        id={`lxc-autostart-${container.name}`}
                                        aria-label={format(T.list.start_on_boot_for, container.name)}
                                        isChecked={container.config["boot.autostart"] === "true"}
                                        isDisabled={busy.has(container.name)}
                                        onChange={(_event, checked) =>
                                            void toggleAutostart(container, checked)}
                                    />
                                </Td>
                            )}
                            {shows("created") && (
                                <Td dataLabel={T.common.created}>{formatCreated(container.createdAt)}</Td>
                            )}
                            <Td isActionCell>
                                <ContainerActions
                                    container={container}
                                    busy={busy.has(container.name)}
                                    onAction={(action) => onAction(container, action)}
                                />
                            </Td>
                        </Tr>
                    ))}
                    {rows.length === 0 && (
                        <Tr>
                            <Td colSpan={9}>
                                <span className="lxc-muted">
                                    {T.list.no_container_matches_the_current_filter}
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

/**
 * One confirmation for a batch.
 *
 * The full list is shown rather than a count: "restart 6 containers" is not
 * something an operator can check, and the point of confirming is to give them
 * something to check.
 */
const BulkConfirmDialog = ({
    action,
    targets,
    skipped,
    onClose,
    onConfirm,
}: {
    action: BulkAction;
    targets: readonly Container[];
    skipped: readonly Container[];
    onClose: () => void;
    onConfirm: () => Promise<void>;
}) => {
    const [busy, setBusy] = useState(false);
    const title = format(T.list.apply_to_containers, actionLabels()[action], targets.length);

    return (
        <Modal isOpen variant="small" onClose={onClose} aria-label={title}>
            <ModalHeader title={title} titleIconVariant="warning" />
            <ModalBody>
                {targets.length === 0
                    ? <p>{T.list.none_of_the_selected_containers_can}</p>
                    : (
                        <ul className="lxc-bulk__list">
                            {targets.map((container) => <li key={container.name}>{container.name}</li>)}
                        </ul>
                    )}
                {skipped.length > 0 && (
                    <Alert
                        variant="info"
                        isInline
                        isPlain
                        title={format(
                            T.list.skipped_already_in_that_state,
                            skipped.map((c) => c.name).join(", "),
                        )}
                    />
                )}
            </ModalBody>
            <ModalFooter>
                <Button
                    variant="primary"
                    isDisabled={busy || targets.length === 0}
                    isLoading={busy}
                    onClick={() => {
                        setBusy(true);
                        void onConfirm().finally(() => { setBusy(false); onClose(); });
                    }}
                >
                    {T.common.apply}
                </Button>
                <Button variant="link" onClick={onClose} isDisabled={busy}>{T.common.cancel}</Button>
            </ModalFooter>
        </Modal>
    );
};
