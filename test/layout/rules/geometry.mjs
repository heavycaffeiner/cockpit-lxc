/**
 * Shared arithmetic and tree walking for the rules.
 *
 * Nothing here touches a browser or the filesystem. The observation array is the
 * whole world a rule gets, which is what makes a rule unit-testable against a
 * hand-written array.
 */

/** Sides, in the order the padding, margin and border tuples use. */
export const TOP = 0;
export const RIGHT = 1;
export const BOTTOM = 2;
export const LEFT = 3;

export const SIDE_NAMES = ["top", "right", "bottom", "left"];

export const near = (a, b, tolerance) => Math.abs(a - b) <= tolerance;

/**
 * Whether a length sits on the grid.
 *
 * The remainder is compared against both 0 and the base, so a value one
 * tolerance below a multiple counts as on grid rather than as almost a full step
 * off it.
 */
export const onGrid = (value, base, tolerance) => {
    const remainder = Math.abs(value % base);
    return remainder <= tolerance || Math.abs(remainder - base) <= tolerance;
};

/**
 * Signed distance to the nearest multiple of the base.
 *
 * Two elements with the same error are off the grid for the same reason: the
 * lower one inherited it. Comparing errors is what lets a rule report where a
 * misalignment was introduced instead of reporting every element that carries
 * its consequences.
 */
export const gridError = (value, base) => value - Math.round(value / base) * base;

/** The two multiples of the base a value falls between, for the message. */
export const bracket = (value, base) => {
    const lower = Math.floor(value / base) * base;
    return [lower, lower + base];
};

/** Round for display, without turning 15.984375 into a number nobody can read. */
export const show = (value) => {
    const rounded = Math.round(value * 100) / 100;
    return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
};

/**
 * The same observations, measured on the part that survives its clipping
 * ancestors.
 *
 * For the rules about what an operator sees or can hit. The spacing rules do not
 * use it: a padding is a decision whether or not the box carrying it is fully on
 * screen.
 */
export const asVisible = (observations) =>
    observations.map((observation) => ({ ...observation, rect: observation.visible ?? observation.rect }));

export const right = (observation) => observation.rect.left + observation.rect.width;
export const bottom = (observation) => observation.rect.top + observation.rect.height;

/** The padding box, which is the border box inset by the border widths. */
export const paddingBox = (observation) => ({
    top: observation.rect.top + observation.border[TOP],
    left: observation.rect.left + observation.border[LEFT],
    right: right(observation) - observation.border[RIGHT],
    bottom: bottom(observation) - observation.border[BOTTOM],
});

/** The content box, which is the padding box inset by the padding. */
export const contentBox = (observation) => {
    const box = paddingBox(observation);
    return {
        top: box.top + observation.padding[TOP],
        left: box.left + observation.padding[LEFT],
        right: box.right - observation.padding[RIGHT],
        bottom: box.bottom - observation.padding[BOTTOM],
    };
};

/** Children by parent id, built once per observation array. */
export const childrenOf = (observations) => {
    const map = new Map();
    for (const observation of observations) {
        if (observation.parent === null)
            continue;
        const list = map.get(observation.parent) ?? [];
        list.push(observation);
        map.set(observation.parent, list);
    }
    return map;
};

/** Every descendant of an observation, depth first. */
export const descendantsOf = (observation, children) => {
    const result = [];
    const stack = [...(children.get(observation.id) ?? [])];
    while (stack.length > 0) {
        const next = stack.pop();
        result.push(next);
        stack.push(...(children.get(next.id) ?? []));
    }
    return result;
};

/** Ids from an observation up to the root, nearest first. */
export const ancestorIds = (observation, byId) => {
    const chain = [];
    let current = observation.parent;
    while (current !== null && current !== undefined) {
        chain.push(current);
        current = byId.get(current)?.parent ?? null;
    }
    return chain;
};

/**
 * A parent that lays its children out as a block column.
 *
 * These are the containers where sharing a start edge is the expectation. A row
 * of flex items is supposed to have different start edges, and a table lays out
 * by its own rules.
 */
export const isBlockColumn = (observation) => {
    if (observation.display === "block" || observation.display === "flow-root" || observation.display === "list-item")
        return true;
    return observation.display.includes("flex") &&
        (observation.flexDirection === "column" || observation.flexDirection === "column-reverse");
};

/**
 * A child that occupies space in its parent's flow.
 *
 * A floated or out-of-flow child has deliberately left the column, so nothing
 * below it moves when it does. A sticky one has not: it is laid out in flow and
 * then offset, and the space it took stays taken. Table parts follow the table
 * algorithm rather than the block one.
 */
export const isInFlow = (observation) => {
    if (!["static", "relative", "sticky"].includes(observation.position))
        return false;
    if (observation.float !== "none")
        return false;
    if (observation.display.startsWith("table-") || observation.display === "contents")
        return false;
    return true;
};

/**
 * A child that is a block of its own in its parent's column.
 *
 * Inline-level children share a line, so their start edges are supposed to
 * differ and comparing them is meaningless. They still take vertical space,
 * which is why the rules about the column's rhythm use isInFlow instead.
 */
export const isInFlowBlock = (observation) =>
    isInFlow(observation) && !observation.display.startsWith("inline");

/**
 * The column as the block algorithm sees it: each block-level child on its own,
 * and each run of inline-level siblings collapsed into the anonymous block box
 * that wraps it.
 *
 * PatternFly's breadcrumb is `display: inline-flex`. Without this it leaves the
 * column entirely, and the header under it is measured against the container's
 * content edge instead of against the breadcrumb sitting on top of it.
 *
 * Input must be in document order, because that is what decides which inline
 * children are consecutive. Output is in visual order, so "the block above"
 * means what it says.
 */
export const bands = (column) => {
    const result = [];
    let run = null;

    for (const child of column) {
        if (!child.display.startsWith("inline")) {
            run = null;
            result.push({ top: child.rect.top, bottom: bottom(child), first: child, inline: false });
            continue;
        }

        if (run === null) {
            run = { top: child.rect.top, bottom: bottom(child), first: child, inline: true };
            result.push(run);
            continue;
        }

        run.top = Math.min(run.top, child.rect.top);
        run.bottom = Math.max(run.bottom, bottom(child));
    }

    return result.sort((a, b) => a.top - b.top);
};

/**
 * Flex items split into the lines they were laid out on.
 *
 * Grouped by overlap along the cross axis, because flex lines are stacked and
 * never overlap, while every item that has not opted out with `align-self` is
 * placed against the same edge of its own line. The main axis cannot be used:
 * `margin-inline-start: auto` on a toolbar item puts it at the far end of the
 * second line, further along than the item it wrapped away from.
 *
 * Items must be in document order, which is the order they were laid out in
 * unless something set `order`. That is rare enough not to model. Only sound
 * for items whose align-self is `auto`.
 */
export const flexLines = (items, direction) => {
    const vertical = direction.startsWith("column");
    const start = vertical ? (o) => o.rect.left : (o) => o.rect.top;
    const end = vertical ? right : bottom;

    const lines = [];
    let current = null;

    for (const item of items) {
        if (current !== null && start(item) < current.end && end(item) > current.start) {
            current.members.push(item);
            current.start = Math.min(current.start, start(item));
            current.end = Math.max(current.end, end(item));
            continue;
        }

        current = { start: start(item), end: end(item), members: [item] };
        lines.push(current);
    }

    return lines.map((line) => line.members);
};

/** Group values that agree within tolerance, largest group first. */
export const cluster = (items, valueOf, tolerance) => {
    const groups = [];
    for (const item of items) {
        const value = valueOf(item);
        const match = groups.find((group) => near(group.value, value, tolerance));
        if (match === undefined)
            groups.push({ value, members: [item] });
        else
            match.members.push(item);
    }
    // Largest first, ties broken by the smaller value so the reported majority
    // is stable across runs rather than depending on document order.
    groups.sort((a, b) => b.members.length - a.members.length || a.value - b.value);
    return groups;
};
