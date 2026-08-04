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

import type { ContainerState } from "../backend";

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

export const ContainerStateLabel = ({ state }: { state: ContainerState }) => {
    const appearance = APPEARANCE[state];
    const Icon = appearance.icon;

    return (
        <Label color={appearance.color} icon={<Icon />} isCompact>
            {state}
        </Label>
    );
};
