import { Label } from "@patternfly/react-core";
import {
    ExclamationCircleIcon,
    InProgressIcon,
    OutlinedQuestionCircleIcon,
    PauseCircleIcon,
    PlayCircleIcon,
    PowerOffIcon,
} from "@patternfly/react-icons";
import type { ComponentType } from "react";

import {
    K,
    _,
    type ContainerState,
} from "../backend";

type LabelColor = "green" | "grey" | "blue" | "orange" | "red";

interface Appearance {
    color: LabelColor;
    icon: ComponentType;
}

/**
 * Every state carries both an icon and its text.
 *
 * Colour is never the only carrier of meaning: the label reads correctly in
 * greyscale and to a user with a colour-vision deficiency, which a coloured dot
 * alone would not.
 */
const APPEARANCE: Record<ContainerState, Appearance> = {
    Running: { color: "green", icon: PlayCircleIcon },
    Stopped: { color: "grey", icon: PowerOffIcon },
    Frozen: { color: "blue", icon: PauseCircleIcon },
    Starting: { color: "orange", icon: InProgressIcon },
    Stopping: { color: "orange", icon: InProgressIcon },
    Freezing: { color: "orange", icon: InProgressIcon },
    Error: { color: "red", icon: ExclamationCircleIcon },
    Unknown: { color: "grey", icon: OutlinedQuestionCircleIcon },
};

/**
 * Listed rather than translated by variable, so that xgettext can find them.
 * A bare `_(state)` extracts nothing and would ship an untranslated label.
 */
export const stateName = (state: ContainerState): string => STATE_TEXT()[state];

const STATE_TEXT = (): Record<ContainerState, string> => ({
    Running: _(K.container_state_label.running),
    Stopped: _(K.container_state_label.stopped),
    Frozen: _(K.container_state_label.frozen),
    Starting: _(K.container_state_label.starting),
    Stopping: _(K.container_state_label.stopping),
    Freezing: _(K.container_state_label.freezing),
    Error: _(K.container_state_label.error),
    Unknown: _(K.container_state_label.unknown),
});

export const ContainerStateLabel = ({ state }: { state: ContainerState }) => {
    const appearance = APPEARANCE[state];
    const Icon = appearance.icon;

    return (
        <Label color={appearance.color} icon={<Icon />} isCompact>
            {STATE_TEXT()[state]}
        </Label>
    );
};
