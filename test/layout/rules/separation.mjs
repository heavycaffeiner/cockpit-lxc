/**
 * Group P: separation.
 *
 * Padding in the right places, judged by the result rather than by the
 * declaration. Whether the space comes from the container's padding or from the
 * child's margin does not matter and is not asked.
 */
import {
    asVisible,
    LEFT,
    RIGHT,
    TOP,
    BOTTOM,
    SIDE_NAMES,
    ancestorIds,
    bottom,
    childrenOf,
    contentBox,
    descendantsOf,
    near,
    paddingBox,
    right,
    show,
} from "./geometry.mjs";

const finding = (rule, observation, detail, value) => ({
    rule,
    selector: observation.selector,
    detail,
    value,
    rect: observation.rect,
    waivers: observation.waivers,
});

/** How much two intervals overlap, as a fraction of the shorter one. */
const overlapRatio = (aStart, aEnd, bStart, bEnd) => {
    const overlap = Math.min(aEnd, bEnd) - Math.max(aStart, bStart);
    const shorter = Math.min(aEnd - aStart, bEnd - bStart);
    return shorter <= 0 ? 0 : overlap / shorter;
};

/**
 * P1: two interaction targets that touch.
 *
 * Zero separation is the correct design inside a segmented control or an input
 * group, where the parts read as one control precisely because they touch. That
 * is what the grouping allow-list in config.json is for, and why the check is on
 * the nearest common ancestor rather than on either element.
 */
export const P1 = (raw, { separation }) => {
    const findings = [];
    // Measured on the part an overflow ancestor left on screen. A tab that
    // continues under a scroll button is not something the operator can
    // mis-hit, because the part that overlaps is not drawn.
    const observations = asVisible(raw);
    const byId = new Map(observations.map((o) => [o.id, o]));
    const targets = observations
        .filter((o) => o.interactive)
        // A box holding other targets is a container, not a target of its own.
        // PatternFly gives a tab panel `tabindex="0"` so it can be scrolled by
        // keyboard, and treating that panel as a button makes it collide with
        // everything inside it.
        .filter((o) => !o.containsInteractive);
    const chains = new Map(targets.map((o) => [o.id, ancestorIds(o, byId)]));

    for (let i = 0; i < targets.length; i += 1) {
        for (let j = i + 1; j < targets.length; j += 1) {
            const a = targets[i];
            const b = targets[j];

            // Different layers never touch: an open modal covers the page, so
            // its buttons overlap whatever is behind them by design, and the
            // operator can only reach one of the two.
            if (a.layer !== b.layer)
                continue;

            const chainA = chains.get(a.id);
            const chainB = chains.get(b.id);
            if (chainA.includes(b.id) || chainB.includes(a.id))
                continue;

            const horizontalOverlap = overlapRatio(a.rect.top, bottom(a), b.rect.top, bottom(b));
            const verticalOverlap = overlapRatio(a.rect.left, right(a), b.rect.left, right(b));

            let axis = null;
            let gap = 0;
            if (horizontalOverlap >= separation.overlapRatio) {
                axis = "horizontally";
                gap = Math.max(a.rect.left, b.rect.left) - Math.min(right(a), right(b));
            } else if (verticalOverlap >= separation.overlapRatio) {
                axis = "vertically";
                gap = Math.max(a.rect.top, b.rect.top) - Math.min(bottom(a), bottom(b));
            }

            // A negative gap means they overlap outright, which is a stronger
            // form of the same defect and reported the same way.
            if (axis === null || gap >= separation.minGap)
                continue;

            const nearestCommon = chainA.find((id) => chainB.includes(id));
            if (nearestCommon !== undefined && byId.get(nearestCommon)?.grouping === true)
                continue;

            findings.push(finding(
                "P1",
                b,
                `sits ${show(gap)}px ${axis} from the target "${a.selector}", ` +
                `which is under the ${separation.minGap}px minimum`,
                `gap: ${show(gap)}px`,
            ));
        }
    }

    return findings;
};

/**
 * P2: content flush against a bordered or scrolling edge.
 *
 * Measured from the box's padding edge to the *content* box of the nearest
 * text-bearing descendant, not to its border box. A table header inside a
 * bordered box has a cell whose border box starts at the box edge and whose text
 * does not, because the cell has padding of its own. Comparing border boxes
 * would report that as flush; comparing to the text element's content box asks
 * the question the rule is actually about, and a distance of zero there means
 * nothing anywhere in the chain provided separation.
 *
 * Checked per side, and only on sides that have an edge. A `border-bottom` under
 * a table header does not make that element's left edge into something text
 * should be held away from.
 */
export const P2 = (observations, { grid }) => {
    const findings = [];
    const children = childrenOf(observations);

    for (const box of observations) {
        if (!box.edgeBox)
            continue;

        const inner = paddingBox(box);
        const text = descendantsOf(box, children)
            .filter((o) => o.hasText)
            .filter((o) => o.position === "static" || o.position === "relative");
        if (text.length === 0)
            continue;

        for (const side of [TOP, RIGHT, BOTTOM, LEFT]) {
            // An edge is a border, or the place content is cut off. A box that
            // scrolls vertically cuts nothing at its left and right, and a box
            // that scrolls but has not overflowed cuts nothing at all.
            const clips = side === TOP || side === BOTTOM ? box.overflowing.y : box.overflowing.x;
            if (!clips && box.border[side] === 0)
                continue;

            const flush = text.find((descendant) => {
                const content = contentBox(descendant);
                const distance = side === TOP ? content.top - inner.top
                    : side === LEFT ? content.left - inner.left
                        : side === RIGHT ? inner.right - content.right
                            : inner.bottom - content.bottom;
                return near(distance, 0, grid.tolerance);
            });

            if (flush === undefined)
                continue;

            findings.push(finding(
                "P2",
                box,
                `text in "${flush.selector}" sits on this box's ${SIDE_NAMES[side]} inner edge ` +
                "with no padding or margin anywhere between them",
                `flush: ${SIDE_NAMES[side]}`,
            ));
        }
    }

    return findings;
};

/**
 * P3: a target below the minimum size.
 *
 * The same defect as P1 and P2 seen from the element's own side rather than from
 * the space around it: in practice an interactive element below this size is one
 * that was not given padding.
 */
export const P3 = (observations, { separation }) => {
    const findings = [];

    for (const observation of observations) {
        if (!observation.interactive)
            continue;

        // The hittable area, which for a checkbox is its label rather than the
        // 13px native control the browser draws inside it.
        const { width, height } = observation.target ?? observation.rect;

        const under = [];
        if (width < separation.minTargetSize)
            under.push("width");
        if (height < separation.minTargetSize)
            under.push("height");
        if (under.length === 0)
            continue;

        findings.push(finding(
            "P3",
            observation,
            `has a ${show(width)} by ${show(height)}px target, under the ` +
            `${separation.minTargetSize} by ${separation.minTargetSize}px minimum`,
            /*
             * Which dimension is short, without the measurement. A button's
             * width is the width of the word on it, so a waiver carrying the
             * number would stop matching the day that word is retranslated.
             */
            `target: ${under.join(" and ")}`,
        ));
    }

    return findings;
};
