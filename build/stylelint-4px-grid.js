/**
 * stylelint plugin: cockpit-lxc/four-px-grid
 *
 * Rejects length literals that do not resolve to a multiple of 4px in the
 * properties that determine layout geometry.
 *
 * Why this exists (proposal section 4.3.7): PatternFly 6's spacer scale is built
 * on a 0.25rem increment, which at Cockpit's 16px root font size is exactly 4px.
 * Styles written purely in PatternFly tokens are therefore on the grid by
 * construction, and this rule is the backstop for the cases tokens do not cover.
 *
 * A single hand-written `padding: 10px` does not look broken on its own, but it
 * puts everything below it off the shared baseline, and next to a built-in
 * Cockpit page the plugin reads as foreign without a reviewer being able to say
 * why. Catching that by eye does not scale, so it is a build gate instead.
 */
import stylelint from "stylelint";

const {
    createPlugin,
    utils: { report, ruleMessages, validateOptions },
} = stylelint;

const ruleName = "cockpit-lxc/four-px-grid";

const messages = ruleMessages(ruleName, {
    rejected: (prop, token, resolved) =>
        `Unexpected off-grid length "${token}" in "${prop}" (resolves to ${resolved}px). ` +
        "Layout lengths must be multiples of 4px. Prefer a PatternFly spacer token, " +
        "for example var(--pf-t--global--spacer--md).",
});

const meta = {
    url: "https://github.com/heavycaffeiner/cockpit-lxc#the-4px-grid",
};

/**
 * Properties whose lengths define layout geometry.
 *
 * `border-*` and `outline-*` are deliberately absent: a 1px border is not
 * spacing, and forcing it onto a 4px grid would be absurd.
 */
const DEFAULT_PROPERTIES = [
    "margin", "margin-block", "margin-block-start", "margin-block-end",
    "margin-inline", "margin-inline-start", "margin-inline-end",
    "margin-top", "margin-right", "margin-bottom", "margin-left",
    "padding", "padding-block", "padding-block-start", "padding-block-end",
    "padding-inline", "padding-inline-start", "padding-inline-end",
    "padding-top", "padding-right", "padding-bottom", "padding-left",
    "gap", "row-gap", "column-gap",
    "inset", "inset-block", "inset-inline",
    "top", "right", "bottom", "left",
    "width", "min-width", "max-width",
    "height", "min-height", "max-height",
    "block-size", "min-block-size", "max-block-size",
    "inline-size", "min-inline-size", "max-inline-size",
    "flex-basis", "line-height",
];

/**
 * Matches a signed decimal followed by px or rem. Values expressed with var(),
 * percentages, `auto` and keywords carry no literal and so never match, which is
 * exactly the intent: token-based styles pass without special-casing.
 */
const LENGTH_RE = /(-?\d*\.?\d+)(px|rem)\b/gi;

const EPSILON = 1e-6;

const ruleFunction = (primary, secondaryOptions) => (root, result) => {
    const valid = validateOptions(
        result,
        ruleName,
        { actual: primary, possible: [true, false] },
        {
            actual: secondaryOptions,
            possible: {
                properties: [(v) => typeof v === "string"],
                base: [(v) => typeof v === "number"],
                rootFontSize: [(v) => typeof v === "number"],
            },
            optional: true,
        },
    );

    if (!valid || !primary)
        return;

    const opts = secondaryOptions ?? {};
    const base = opts.base ?? 4;
    const rootFontSize = opts.rootFontSize ?? 16;
    const properties = new Set(
        (opts.properties ?? DEFAULT_PROPERTIES).map((p) => p.toLowerCase()),
    );

    root.walkDecls((decl) => {
        const prop = decl.prop.toLowerCase().replace(/^-\w+-/, "");

        /*
         * Custom properties are checked as well. Without this, `--lxc-gap: 10px`
         * would smuggle an off-grid value past the rule, because every use site
         * would be a var() reference carrying no literal of its own.
         */
        const isCustomProperty = decl.prop.startsWith("--");
        if (!isCustomProperty && !properties.has(prop))
            return;

        LENGTH_RE.lastIndex = 0;
        let match;
        while ((match = LENGTH_RE.exec(decl.value)) !== null) {
            const [token, rawNumber, unit] = match;
            const parsed = Number.parseFloat(rawNumber);
            if (parsed === 0)
                continue;

            const px = unit.toLowerCase() === "rem" ? parsed * rootFontSize : parsed;
            const remainder = Math.abs(px % base);
            if (remainder < EPSILON || Math.abs(remainder - base) < EPSILON)
                continue;

            const offset =
                decl.prop.length + (decl.raws.between ?? ":").length + match.index;

            report({
                message: messages.rejected(decl.prop, token, px),
                node: decl,
                index: offset,
                endIndex: offset + token.length,
                result,
                ruleName,
            });
        }
    });
};

ruleFunction.ruleName = ruleName;
ruleFunction.messages = messages;
ruleFunction.meta = meta;

export default createPlugin(ruleName, ruleFunction);
