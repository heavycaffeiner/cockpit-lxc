/**
 * Group A: alignment.
 *
 * Alignment is a property of two or more elements, so no single declaration is
 * wrong when a toolbar starts at 16px and the table below it starts at 0. Both
 * values are on grid and the page still reads as broken. This is the class of
 * defect no source-text rule can express.
 *
 * The comparison is equality between elements, not conformance to the grid. G1
 * already covers the grid.
 */
import {
    asVisible,
    bottom,
    childrenOf,
    cluster,
    flexLines,
    isBlockColumn,
    isInFlowBlock,
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

/**
 * Report the minority of a cohort rather than every member.
 *
 * A column of eight blocks with one stray is one defect. Reporting it eight
 * times would bury it in its own consequences.
 */
const reportStrays = (rule, groups, label, findings) => {
    const [majority, ...rest] = groups;
    if (majority === undefined || rest.length === 0)
        return;

    for (const group of rest) {
        for (const member of group.members) {
            findings.push(finding(
                rule,
                member,
                `${label} is at ${show(group.value)}px where ${majority.members.length} sibling(s) ` +
                `share ${show(majority.value)}px`,
                /*
                 * The edge that disagrees, without the coordinates. Both numbers
                 * move whenever anything above or beside this element changes,
                 * so a waiver carrying them would stop matching for a reason
                 * that has nothing to do with the alignment being waived.
                 */
                label,
            ));
        }
    }
};

export const A1 = (raw, { grid }) => {
    const findings = [];
    // Edges as drawn. A box wider than the ancestor that clips it ends where the
    // clip does, and that is the edge a reader compares against its neighbours.
    const observations = asVisible(raw);
    const children = childrenOf(observations);

    for (const parent of observations) {
        if (!isBlockColumn(parent))
            continue;

        const cohort = (children.get(parent.id) ?? []).filter(isInFlowBlock);
        if (cohort.length < 2)
            continue;

        reportStrays("A1", cluster(cohort, (o) => o.rect.left, grid.tolerance), "start edge", findings);
    }

    return findings;
};

export const A2 = (raw, { grid }) => {
    const findings = [];
    const observations = asVisible(raw);
    const children = childrenOf(observations);

    for (const root of observations) {
        if (!root.sectionRoot)
            continue;

        const cohort = (children.get(root.id) ?? []).filter(isInFlowBlock);
        if (cohort.length < 2)
            continue;

        // The start edge is A1's job for these too, but the end edge is checked
        // only here. Below the section level an element's end edge is usually a
        // consequence of its width, which is not audited.
        reportStrays("A2", cluster(cohort, right, grid.tolerance), "end edge", findings);
    }

    return findings;
};

/**
 * What a row's declared `align-items` requires of its items, geometrically.
 *
 * `stretch` is absent because an item with its own block size legitimately opts
 * out of it. `baseline` is absent because verifying it means measuring text
 * baselines through Range.getClientRects, which is a materially larger piece of
 * machinery than the defect justifies.
 */
const CROSS_AXIS = {
    "flex-start": { label: "top edge", measure: (o) => o.rect.top },
    start: { label: "top edge", measure: (o) => o.rect.top },
    "flex-end": { label: "bottom edge", measure: bottom },
    end: { label: "bottom edge", measure: bottom },
    center: { label: "centre", measure: (o) => o.rect.top + o.rect.height / 2 },
};

export const A3 = (raw, { grid }) => {
    const findings = [];
    const observations = asVisible(raw);
    const children = childrenOf(observations);

    for (const parent of observations) {
        const isRow = parent.flexDirection === "row" || parent.flexDirection === "row-reverse";
        if (!isRow)
            continue;

        const expectation = CROSS_AXIS[parent.alignItems ?? ""];
        if (expectation === undefined)
            continue;

        const cohort = (children.get(parent.id) ?? [])
            .filter((child) => child.position === "static" || child.position === "relative")
            // An item that names its own align-self has opted out of the
            // container's, so holding it to the container's is wrong.
            .filter((child) => child.alignSelf === "auto");
        if (cohort.length < 2)
            continue;

        // A centred item with an odd height rounds by half a pixel through
        // nobody's fault, which is why this tolerance is looser than the grid's.
        const tolerance = parent.alignItems === "center" ? grid.centreTolerance : grid.tolerance;
        const lines = parent.flexWrap === "nowrap"
            ? [cohort]
            : flexLines(cohort, parent.flexDirection);

        for (const line of lines) {
            if (line.length < 2)
                continue;
            reportStrays("A3", cluster(line, expectation.measure, tolerance), expectation.label, findings);
        }
    }

    return findings;
};
