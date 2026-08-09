/**
 * Measure the laid-out document. Runs inside the page.
 *
 * Returns one flat array in document order, parents before children, so a rule
 * can resolve a parent by index without a second pass. Contains no thresholds
 * and no rule logic: everything a rule needs to decide is in the returned data,
 * which is what keeps the rules pure, unit-testable against a hand-written array
 * and re-runnable without paying for a render.
 *
 * Every selector the rules or the waivers care about is matched here, by the
 * browser, and recorded as a flag or an index list. Nothing in Node re-implements
 * CSS selector matching.
 *
 * LTR horizontal-tb only. The `padding`, `margin` and `border` tuples are in
 * top, right, bottom, left order, which under that writing mode is also
 * block-start, inline-end, block-end, inline-start.
 */

export interface ProbeConfig {
    /** Subtrees excluded from the audit set. */
    excludeSelectors: string[];
    /** Containers whose descendants may touch without separation. */
    groupingSelectors: string[];
    /** What counts as an interaction target. */
    interactiveSelector: string;
    /** A view's content root, for the section-edge rule. */
    sectionRootSelector: string;
    /** Waiver selectors, in file order. Matches are recorded by index. */
    waiverSelectors: string[];
}

export interface Observation {
    id: number;
    /** id of the nearest audited ancestor, or null for a root. */
    parent: number | null;
    selector: string;
    tag: string;
    /** Border box, relative to the document origin. */
    rect: { top: number; left: number; width: number; height: number };
    /**
     * The part of the border box an overflow ancestor has not cut away.
     *
     * Equal to `rect` for almost everything. It differs inside a scroll
     * container, where a box can extend well past the edge that clips it: a
     * PatternFly tab list keeps its overflowing tabs at full width under the
     * scroll buttons drawn over them, so their border boxes overlap boxes an
     * operator can never touch at the same time.
     */
    visible: { top: number; left: number; width: number; height: number };
    padding: [number, number, number, number];
    margin: [number, number, number, number];
    /**
     * Which margins were declared `auto`.
     *
     * getComputedStyle resolves a margin to its used value, so an auto margin
     * arrives as however much space was left over. The Typed OM keeps the
     * computed value, where `auto` is still the keyword, which is the only way
     * to tell "someone wrote 191px" from "the layout ended up 191px".
     */
    autoMargin: [boolean, boolean, boolean, boolean];
    /**
     * True when a block size was declared rather than left to the content.
     *
     * `height: auto` means the box is as tall as what is inside it, which is a
     * consequence of font metrics and text wrapping rather than a decision
     * anyone made. Anything else was chosen, and a chosen height is what the 4px
     * rule is about.
     */
    authoredHeight: boolean;
    border: [number, number, number, number];
    gap: { row: number; column: number } | null;
    display: string;
    position: string;
    float: string;
    flexDirection: string | null;
    /**
     * Null unless the box is a flex container.
     *
     * Cross-axis alignment applies per flex line, so a wrapped row's second line
     * has nothing to do with its first. Comparing across the two reports every
     * item that wrapped as a stray.
     */
    flexWrap: string | null;
    alignItems: string | null;
    /** "auto" unless the item opts out of its container's cross-axis alignment. */
    alignSelf: string;
    interactive: boolean;
    /**
     * The area a pointer can actually hit, which for a checkbox is its label
     * rather than the 13px native control inside it. Null when not interactive.
     */
    target: { width: number; height: number } | null;
    /**
     * The nearest out-of-flow ancestor, self included, or null at the base layer.
     *
     * An open modal sits on top of the page, so its buttons overlap whatever is
     * behind them. Comparing the two as though they were neighbours reports a
     * collision between things the operator can never see at once.
     */
    layer: number | null;
    /** True when another interaction target is inside this one. */
    containsInteractive: boolean;
    grouping: boolean;
    sectionRoot: boolean;
    edgeBox: boolean;
    /**
     * Whether content runs past the box on each axis and is cut off there.
     *
     * `overflow: auto` on a box whose content fits draws nothing and hides
     * nothing, so its inner edge is not something text has to be held away from.
     * The axis matters too: a horizontally scrolling table clips at its left and
     * right, and text sitting on its bottom edge is a different question.
     */
    overflowing: { x: boolean; y: boolean };
    hasText: boolean;
    /** Indices into ProbeConfig.waiverSelectors that this element matches. */
    waivers: number[];
}

const px = (value: string): number => {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
};

/**
 * React's useId produces ids like `text-input-:r7:`, numbered by mount order.
 * Adding a component anywhere earlier renumbers every one after it, so a waiver
 * naming one stops matching for a reason unrelated to what it waives.
 */
const isGeneratedId = (id: string): boolean => id.includes(":");

/**
 * A path a human can paste into the console and get this element back.
 *
 * Class names are included one at a time rather than all of them, because a
 * PatternFly element can carry six and the resulting string is unreadable in a
 * report table. nth-of-type disambiguates the rest.
 *
 * Ids and class names go through CSS.escape because Incus config keys are used
 * as ids verbatim, and `limits.memory.swap` unescaped parses as three class
 * selectors on an element that has none of them.
 */
const describe = (element: Element): string => {
    const parts: string[] = [];
    let node: Element | null = element;

    while (node !== null && node !== document.documentElement && parts.length < 4) {
        let part = node.tagName.toLowerCase();

        if (node.id !== "" && !isGeneratedId(node.id))
            part += `#${CSS.escape(node.id)}`;

        const className = node.classList[0];
        if (className !== undefined)
            part += `.${CSS.escape(className)}`;

        const parent: Element | null = node.parentElement;
        if (parent !== null) {
            const twins = [...parent.children].filter((c) => c.tagName === node?.tagName);
            if (twins.length > 1)
                part += `:nth-of-type(${twins.indexOf(node) + 1})`;
        }

        parts.unshift(part);
        node = parent;
    }

    return parts.join(" > ");
};

const matchesAny = (element: Element, selector: string): boolean => {
    if (selector === "")
        return false;
    try {
        return element.matches(selector);
    } catch {
        return false;
    }
};

/**
 * Whether each margin was declared `auto`, in top, right, bottom, left order.
 *
 * computedStyleMap holds computed values, where `auto` survives as a keyword.
 * getComputedStyle holds resolved values, where it has already become a number.
 */
const computedKeywords = (element: Element) => {
    const withMap = element as Element & { computedStyleMap?: () => StylePropertyMapReadOnly };
    const map = typeof withMap.computedStyleMap === "function" ? withMap.computedStyleMap() : null;

    return (property: string): string => {
        if (map === null)
            return "";
        try {
            return String(map.get(property));
        } catch {
            return "";
        }
    };
};

/** Viewport-relative edges. The clip carried down the walk is one of these. */
interface Edges { top: number; right: number; bottom: number; left: number }

const clipTo = (box: Edges, clip: Edges | null): Edges => clip === null ? box : {
    top: Math.max(box.top, clip.top),
    right: Math.min(box.right, clip.right),
    bottom: Math.min(box.bottom, clip.bottom),
    left: Math.max(box.left, clip.left),
};

const area = (box: Edges): number =>
    Math.max(0, box.right - box.left) * Math.max(0, box.bottom - box.top);

/**
 * How big the target is, control and label together.
 *
 * A native checkbox is 13px however the component around it is styled, and its
 * label is the rest of the target. Measuring the control alone would report
 * every checkbox on the page as undersized while none of them is hard to hit.
 *
 * Not clipped, unlike `visible`. A button half past the right edge of a table
 * that scrolls sideways is a full-sized button one scroll away, which is a
 * different complaint from the one this feeds.
 */
const targetRect = (element: Element, rect: DOMRect): { width: number; height: number } => {
    let label: Element | null = element.closest("label");

    if (label === null && element.id !== "") {
        try {
            label = document.querySelector(`label[for="${CSS.escape(element.id)}"]`);
        } catch {
            label = null;
        }
    }

    if (label === null)
        return { width: rect.width, height: rect.height };

    const labelRect = label.getBoundingClientRect();
    return {
        width: Math.max(rect.right, labelRect.right) - Math.min(rect.left, labelRect.left),
        height: Math.max(rect.bottom, labelRect.bottom) - Math.min(rect.top, labelRect.top),
    };
};

const hasDirectText = (element: Element): boolean => {
    for (const node of element.childNodes) {
        if (node.nodeType === Node.TEXT_NODE && (node.textContent ?? "").trim() !== "")
            return true;
    }
    return false;
};

export const probe = (config: ProbeConfig): Observation[] => {
    const result: Observation[] = [];
    const excluded = config.excludeSelectors.join(", ");
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;

    const isAudited = (
        style: CSSStyleDeclaration,
        rect: DOMRect,
        visible: Edges,
    ): boolean =>
        rect.width > 0 &&
        rect.height > 0 &&
        // Scrolled out of its container, so on screen it is not there at all.
        area(visible) > 0 &&
        style.visibility !== "hidden" &&
        style.display !== "none" &&
        // An inline box is a line box. Its geometry comes from font metrics
        // rather than from any spacing declaration, so holding it to a 4px grid
        // is a category error.
        style.display !== "inline";

    const observe = (
        element: Element,
        style: CSSStyleDeclaration,
        rect: DOMRect,
        visible: Edges,
        parent: number | null,
        layer: number | null,
    ): Observation => {
        const isFlexOrGrid = style.display.includes("flex") || style.display.includes("grid");
        const waivers: number[] = [];
        config.waiverSelectors.forEach((selector, index) => {
            if (matchesAny(element, selector))
                waivers.push(index);
        });

        const border: [number, number, number, number] = [
            px(style.borderTopWidth),
            px(style.borderRightWidth),
            px(style.borderBottomWidth),
            px(style.borderLeftWidth),
        ];

        // Both halves are needed: the axis has to clip, and something has to be
        // there to clip. scrollWidth and clientWidth are integers, so a box whose
        // content matches it exactly can report one more than the other.
        const overflowing = {
            x: style.overflowX !== "visible" && element.scrollWidth > element.clientWidth + 1,
            y: style.overflowY !== "visible" && element.scrollHeight > element.clientHeight + 1,
        };

        const interactive = matchesAny(element, config.interactiveSelector);
        const computed = computedKeywords(element);

        return {
            id: result.length,
            parent,
            selector: describe(element),
            tag: element.tagName.toLowerCase(),
            rect: {
                // Document-relative, so a scrolled page measures the same as an
                // unscrolled one and a finding's coordinates survive the
                // screenshot pass.
                top: rect.top + scrollY,
                left: rect.left + scrollX,
                width: rect.width,
                height: rect.height,
            },
            visible: {
                top: visible.top + scrollY,
                left: visible.left + scrollX,
                width: visible.right - visible.left,
                height: visible.bottom - visible.top,
            },
            padding: [
                px(style.paddingTop),
                px(style.paddingRight),
                px(style.paddingBottom),
                px(style.paddingLeft),
            ],
            margin: [
                px(style.marginTop),
                px(style.marginRight),
                px(style.marginBottom),
                px(style.marginLeft),
            ],
            autoMargin: [
                computed("margin-top") === "auto",
                computed("margin-right") === "auto",
                computed("margin-bottom") === "auto",
                computed("margin-left") === "auto",
            ],
            authoredHeight: computed("height") !== "auto" && computed("height") !== "",
            border,
            gap: isFlexOrGrid ? { row: px(style.rowGap), column: px(style.columnGap) } : null,
            display: style.display,
            position: style.position,
            float: style.float,
            flexDirection: isFlexOrGrid ? style.flexDirection : null,
            flexWrap: isFlexOrGrid ? style.flexWrap : null,
            alignItems: isFlexOrGrid ? style.alignItems : null,
            alignSelf: style.alignSelf,
            interactive,
            target: interactive ? targetRect(element, rect) : null,
            layer,
            containsInteractive: element.querySelector(config.interactiveSelector) !== null,
            grouping: matchesAny(element, config.groupingSelectors.join(", ")),
            sectionRoot: matchesAny(element, config.sectionRootSelector),
            // A visible edge, not a component name. A box has one where it drew
            // a border or where it clips its content; a plain inline alert has
            // neither, and its text sitting at its own bounds is not a defect.
            edgeBox: overflowing.x || overflowing.y || border.some((width) => width > 0),
            overflowing,
            hasText: hasDirectText(element),
            waivers,
        };
    };

    const walk = (
        element: Element,
        parent: number | null,
        layer: number | null,
        clip: Edges | null,
    ): void => {
        // Harness-injected nodes, and the subtrees config excludes, are skipped
        // whole. Skipping only the node would let its descendants back in.
        if (element.hasAttribute("data-lxc-audit-harness") || matchesAny(element, excluded))
            return;

        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        const visible = clipTo(rect, clip);

        let id = parent;
        let childLayer = layer;
        if (isAudited(style, rect, visible)) {
            id = result.length;
            // An out-of-flow box opens a layer of its own, and everything below
            // it belongs to that layer rather than to the page behind it.
            childLayer = ["absolute", "fixed", "sticky"].includes(style.position) ? id : layer;
            result.push(observe(element, style, rect, visible, parent, childLayer));
        }

        // Overflow clips at the padding box, and an absolutely positioned
        // descendant escapes a clip its containing block does not impose. Both
        // are ignored here: this is a bound on what is on screen, and the cases
        // it is loose about are rarer than the case it fixes.
        let childClip = clip;
        if (style.overflowX !== "visible" || style.overflowY !== "visible") {
            childClip = clipTo({
                top: rect.top + px(style.borderTopWidth),
                right: rect.right - px(style.borderRightWidth),
                bottom: rect.bottom - px(style.borderBottomWidth),
                left: rect.left + px(style.borderLeftWidth),
            }, clip);
        }

        // `id`, not `parent`, so an observation's parent is its nearest audited
        // ancestor rather than its nearest DOM ancestor.
        for (const child of element.children)
            walk(child, id, childLayer, childClip);
    };

    walk(document.body, null, null, null);
    return result;
};

declare global {
    interface Window {
        __lxcProbe?: (config: ProbeConfig) => Observation[];
    }
}

window.__lxcProbe = probe;
