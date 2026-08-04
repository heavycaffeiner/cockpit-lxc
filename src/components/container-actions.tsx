import {
    Dropdown,
    DropdownItem,
    DropdownList,
    Divider,
    MenuToggle,
    Spinner,
    type MenuToggleElement,
} from "@patternfly/react-core";
import { EllipsisVIcon } from "@patternfly/react-icons";
import { useState } from "react";

import type { Container, ContainerState } from "../backend";

export type RowAction =
    | "start"
    | "stop"
    | "force-stop"
    | "restart"
    | "freeze"
    | "unfreeze"
    | "rename"
    | "delete";

/**
 * Which actions make sense in a given state.
 *
 * Offering an action that the API will reject is worse than hiding it: the
 * operator learns nothing from "the instance is already running" that the row
 * did not already tell them.
 */
const AVAILABLE: Record<ContainerState, RowAction[]> = {
    Running: ["stop", "force-stop", "restart", "freeze"],
    Stopped: ["start", "rename", "delete"],
    Frozen: ["unfreeze", "stop", "force-stop"],
    // Transitional states: nothing to offer until they settle.
    Starting: [],
    Stopping: [],
    Freezing: [],
    Error: ["start", "force-stop", "delete"],
    Unknown: ["start", "stop", "force-stop"],
};

const LABELS: Record<RowAction, string> = {
    start: "Start",
    stop: "Stop",
    "force-stop": "Force stop",
    restart: "Restart",
    freeze: "Freeze",
    unfreeze: "Unfreeze",
    rename: "Rename",
    delete: "Delete",
};

interface ContainerActionsProps {
    container: Container;
    busy: boolean;
    onAction: (action: RowAction) => void;
}

export const ContainerActions = ({ container, busy, onAction }: ContainerActionsProps) => {
    const [open, setOpen] = useState(false);
    const actions = AVAILABLE[container.state];

    if (busy)
        return <Spinner size="md" aria-label={`${container.name} is changing state`} />;

    return (
        <Dropdown
            isOpen={open}
            onOpenChange={setOpen}
            onSelect={() => setOpen(false)}
            popperProps={{ position: "right" }}
            toggle={(ref: React.Ref<MenuToggleElement>) => (
                <MenuToggle
                    ref={ref}
                    variant="plain"
                    isDisabled={actions.length === 0}
                    onClick={() => setOpen((value) => !value)}
                    isExpanded={open}
                    aria-label={`Actions for ${container.name}`}
                >
                    <EllipsisVIcon />
                </MenuToggle>
            )}
        >
            <DropdownList>
                {actions.map((action, index) => (
                    <div key={action}>
                        {/* Separate the destructive tail from the routine actions. */}
                        {(action === "rename" || action === "delete") &&
                            index > 0 && actions[index - 1] !== "rename" && <Divider />}
                        <DropdownItem
                            onClick={() => onAction(action)}
                            isDanger={action === "delete" || action === "force-stop"}
                        >
                            {LABELS[action]}
                        </DropdownItem>
                    </div>
                ))}
            </DropdownList>
        </Dropdown>
    );
};
