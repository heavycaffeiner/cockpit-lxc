/**
 * Group G: grid conformance.
 *
 * G1 and G2 measure the laid-out box, which is what the stylelint rule in
 * build/stylelint-4px-grid.js cannot reach: an element whose own declarations
 * are all token-valued still lands off the baseline when an ancestor put it
 * there. G3 measures resolved spacing, which is the other half of the same
 * blind spot: var(--pf-t--global--spacer--md) is opaque to source-text analysis
 * and a number here, so PatternFly's own values are audited alongside the
 * plugin's.
 *
 * One principle runs through all three: measure what someone decided, not what
 * the content happened to produce.
 *
 * A width is a share of its container, and a share of an odd container is odd.
 * A position inside a row is the sum of the intrinsic widths of the items before
 * it, which is a property of the words in them. A height left at `auto` is the
 * line box of its text. None of those is a spacing decision, and holding them to
 * a 4px grid reports the font rather than the stylesheet. What is left is
 * genuinely authored: where a block sits in a column, how tall a box was told to
 * be, and every padding, margin and gap.
 *
 * G1 and G2 also report where an error is introduced rather than everywhere it
 * is felt. One heading whose line box is 31.19px tall pushes every element below
 * it off the baseline by the same 0.19px, and listing all of them turns one
 * defect into several hundred rows that bury it.
 */
import {
    SIDE_NAMES,
    bands,
    bracket,
    childrenOf,
    contentBox,
    gridError,
    isBlockColumn,
    isInFlow,
    near,
    onGrid,
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

/**
 * G1: the vertical rhythm, measured as the space each block leaves above it.
 *
 * Not the absolute coordinate. An element's distance from the top of the
 * document is the sum of every heading, paragraph and table row above it, and
 * those are line boxes whose heights come from the type scale. PatternFly 6's
 * body text is 14px at a 1.5 ratio, which is 21px, so a page with any text on it
 * has a fractional residue running down it that no stylesheet in this repository
 * can remove. Auditing absolute positions reports that one typographic decision
 * once per element, several hundred times a page, and buries everything else.
 *
 * The gap above a block is the quantity the stylesheet actually sets: a margin,
 * a collapsed pair of margins, or the parent's own top padding for a first
 * child. It is stable, it points at the element whose spacing is wrong, and it
 * is what a designer means by the vertical rhythm.
 *
 * The inline direction is not checked here, for the same reason widths are not:
 * a left edge inside a centred or content-sized box is decided by how wide the
 * text turned out. Ancestor padding, which is the authored part of an inline
 * position, is covered by G3.
 */
export const G1 = (observations, { grid }) => {
    const findings = [];
    const children = childrenOf(observations);

    for (const parent of observations) {
        if (!isBlockColumn(parent))
            continue;

        const column = (children.get(parent.id) ?? []).filter(isInFlow);
        if (column.length === 0)
            continue;

        const ordered = bands(column);

        ordered.forEach((band, index) => {
            /*
             * An inline band's top is where the line box put it, which is the
             * strut's half-leading and so a font metric rather than a spacing
             * decision. Its own margins are still audited, by G3.
             */
            if (band.inline)
                return;

            const previous = index === 0 ? null : ordered[index - 1];
            const above = previous === null
                ? contentBox(parent).top
                : previous.bottom;
            const gap = band.top - above;

            if (onGrid(gap, grid.base, grid.tolerance))
                return;

            findings.push(finding(
                "G1",
                band.first,
                previous === null
                    ? `sits ${show(gap)}px below its container's content edge`
                    : `sits ${show(gap)}px below the block above it`,
                `gap above: ${show(gap)}px`,
            ));
        });
    }

    return findings;
};

export const G2 = (observations, { grid }) => {
    const findings = [];
    const children = childrenOf(observations);

    for (const observation of observations) {
        /*
         * A height left at `auto` is the height of the text inside it. This is
         * the rule proposal 0 section 4.3.7 states for the terminal viewport,
         * "sized in whole 4px steps", and that only means anything where a size
         * was set.
         */
        if (!observation.authoredHeight)
            continue;

        const measured = observation.rect.height;
        if (onGrid(measured, grid.base, grid.tolerance))
            continue;

        // A parent is as tall as its content, so a parent whose height is off by
        // exactly what a child's height is off by is reporting the child's
        // defect. The child is where the fix goes.
        const error = gridError(measured, grid.base);
        const explained = (children.get(observation.id) ?? []).some((child) =>
            near(error, gridError(child.rect.height, grid.base), grid.tolerance));
        if (explained)
            continue;

        const [low, high] = bracket(measured, grid.base);
        findings.push(finding(
            "G2",
            observation,
            `border-box height is ${show(measured)}px, between ${low} and ${high}`,
            `height: ${show(measured)}px`,
        ));
    }

    return findings;
};

export const G3 = (observations, { grid }) => {
    const findings = [];

    for (const observation of observations) {
        const spacings = [];

        observation.padding.forEach((value, side) => spacings.push([`padding-${SIDE_NAMES[side]}`, value]));
        observation.margin.forEach((value, side) => {
            // An auto margin's resolved value is how much space was left over,
            // not a spacing decision anyone wrote. `margin-inline-start: auto`
            // on a toolbar item is what pushes it to the far end, and its used
            // value is whatever the viewport made it.
            if (observation.autoMargin[side])
                return;
            spacings.push([`margin-${SIDE_NAMES[side]}`, value]);
        });
        if (observation.gap !== null) {
            spacings.push(["row-gap", observation.gap.row]);
            spacings.push(["column-gap", observation.gap.column]);
        }

        for (const [property, value] of spacings) {
            // Zero is always on grid. A negative margin is judged by its size,
            // because pulling an element 6px is as off-grid as pushing it 6px.
            if (value === 0 || onGrid(Math.abs(value), grid.base, grid.tolerance))
                continue;

            findings.push(finding(
                "G3",
                observation,
                `${property} resolves to ${show(value)}px, which is not a multiple of ${grid.base}`,
                `${property}: ${show(value)}px`,
            ));
        }
    }

    return findings;
};
