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

import {
    T,
    format,
    type Container,
    type ContainerState,
} from "../backend";

export type RowAction =
    | "start"
    | "stop"
    | "force-stop"
    | "restart"
    | "freeze"
    | "unfreeze"
    | "rename"
    | "copy"
    | "delete";

/**
 * Which actions make sense in a given state.
 *
 * Offering an action that the API will reject is worse than hiding it: the
 * operator learns nothing from "the instance is already running" that the row
 * did not already tell them.
 */
const AVAILABLE: Record<ContainerState, RowAction[]> = {
    // Copy is offered only on a stopped container: Incus can clone a running
    // one, but the copy captures the disk mid-write, which is a footgun rather
    // than a feature.
    Running: ["stop", "force-stop", "restart", "freeze"],
    Stopped: ["start", "copy", "rename", "delete"],
    Frozen: ["unfreeze", "stop", "force-stop"],
    // Transitional states: nothing to offer until they settle.
    Starting: [],
    Stopping: [],
    Freezing: [],
    Error: ["start", "force-stop", "delete"],
    Unknown: ["start", "stop", "force-stop"],
};

/**
 * Built on each render rather than at module scope, because the catalogue is
 * not loaded when this module is first evaluated.
 */
export const labels = (): Record<RowAction, string> => ({
    start: T.actions.start,
    stop: T.actions.stop,
    "force-stop": T.actions.force_stop,
    restart: T.actions.restart,
    freeze: T.actions.freeze,
    unfreeze: T.actions.unfreeze,
    rename: T.common.rename,
    copy: T.actions.copy,
    delete: T.common.delete,
});

interface ContainerActionsProps {
    container: Container;
    busy: boolean;
    onAction: (action: RowAction) => void;
}

export const ContainerActions = ({ container, busy, onAction }: ContainerActionsProps) => {
    const [open, setOpen] = useState(false);
    const actions = AVAILABLE[container.state];
    const LABELS = labels();

    if (busy) {
        return (
            <Spinner
                size="md"
                aria-label={format(T.actions.is_changing_state, container.name)}
            />
        );
    }

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
                    aria-label={format(T.actions.actions_for, container.name)}
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
