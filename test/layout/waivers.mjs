/**
 * Reasoned exceptions, and the rules that keep the file from rotting.
 *
 * Two guards do the work. A reason is mandatory and cannot be a placeholder,
 * which is what makes a generated baseline unmergeable until every entry has
 * been read. A waiver that matched nothing fails the run, which is what makes
 * fixing a defect break the build until its waiver is deleted, so the deletion
 * lands in the same commit as the fix.
 *
 * Without the second guard waivers accumulate: a defect gets fixed, its waiver
 * stays, and later nobody can tell which entries still describe live constraints.
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const WAIVERS_PATH = path.join(here, "waivers.json");

const MIN_REASON_LENGTH = 40;
const REQUIRED = ["rule", "scenario", "selector", "value", "reason"];

/**
 * Read and validate. Throws on anything malformed, before a browser is launched:
 * paying for 120 renders and then rejecting the waiver file spends several
 * minutes to report something knowable in milliseconds.
 */
export const loadWaivers = async ({ allowTodo = false } = {}) => {
    let parsed;
    try {
        // A leading BOM is stripped rather than rejected. This is a file people
        // edit by hand, and several Windows editors write one; JSON.parse fails
        // on it with a message that shows an invisible character.
        parsed = JSON.parse((await readFile(WAIVERS_PATH, "utf8")).replace(/^\uFEFF/, ""));
    } catch (error) {
        if (error.code === "ENOENT")
            return [];
        throw new Error(`${WAIVERS_PATH} is not valid JSON: ${error.message}`);
    }

    if (!Array.isArray(parsed.waivers))
        throw new Error(`${WAIVERS_PATH} has no "waivers" array`);

    const problems = [];
    parsed.waivers.forEach((waiver, index) => {
        for (const field of REQUIRED) {
            if (typeof waiver[field] !== "string" || waiver[field] === "")
                problems.push(`waiver ${index}: "${field}" is missing or empty`);
        }

        const reason = typeof waiver.reason === "string" ? waiver.reason : "";
        const where = `waiver ${index} (${waiver.rule} ${waiver.selector})`;

        // A regeneration reads the file only to carry existing reasons across,
        // and always exits 1, so rejecting the placeholders here would make a
        // baseline impossible to refresh once one had been written.
        if (reason === "TODO") {
            if (!allowTodo)
                problems.push(`${where}: the reason is still TODO`);
        } else if (reason.length > 0 && reason.length < MIN_REASON_LENGTH) {
            problems.push(
                `${where}: the reason is ${reason.length} characters, ` +
                `under the ${MIN_REASON_LENGTH} character minimum`,
            );
        }
    });

    if (problems.length > 0)
        throw new Error(`${WAIVERS_PATH} is not usable:\n  ${problems.join("\n  ")}`);

    return parsed.waivers;
};

/** Trailing "*" is the only wildcard. Anything richer invites a waiver that silences more than it names. */
const scenarioMatches = (pattern, scenario) =>
    pattern.endsWith("*") ? scenario.startsWith(pattern.slice(0, -1)) : pattern === scenario;

/**
 * Partition findings into waived and unwaived, and report waivers that matched
 * nothing.
 *
 * Selector matching happened in the browser: the probe recorded, per element,
 * which waiver selectors it matches, so `finding.waivers` holds indices into the
 * waiver list. Nothing here re-implements CSS selector matching.
 */
export const reconcile = (findings, waivers) => {
    const used = new Set();
    const waived = [];
    const unwaived = [];

    for (const finding of findings) {
        const index = waivers.findIndex((waiver, at) => {
            if (waiver.rule !== finding.rule)
                return false;
            if (!scenarioMatches(waiver.scenario, finding.scenario))
                return false;
            if (waiver.viewport !== undefined && waiver.viewport !== finding.viewport)
                return false;
            if (waiver.theme !== undefined && waiver.theme !== finding.theme)
                return false;
            if (waiver.value !== finding.value)
                return false;
            return (finding.waivers ?? []).includes(at);
        });

        if (index === -1) {
            unwaived.push(finding);
        } else {
            used.add(index);
            waived.push({ ...finding, waiver: index });
        }
    }

    const unused = waivers
        .map((waiver, index) => ({ waiver, index }))
        .filter(({ index }) => !used.has(index));

    return { waived, unwaived, unused };
};

/**
 * Generalise a probe's selector path into something worth putting in the file.
 *
 * The probe describes an element by its ancestor path so a human can find it
 * again, which makes every instance unique: four checkboxes in four table rows
 * produce four paths differing only by an id and an index. A baseline of those
 * is a list nobody reads, and collapsing it by hand is the work this saves.
 *
 * The last component is kept, with its index and id dropped when a class
 * survives to carry the meaning. The exact measurement still has to match, so a
 * generalised selector cannot quietly waive a different number.
 */
const splitLeaf = (leaf) => {
    const parts = { tag: "", id: "", className: "" };
    let field = "tag";

    for (let index = 0; index < leaf.length; index += 1) {
        const character = leaf[index];

        // An escaped character belongs to whichever name it appears in, dot
        // included: an Incus config key is an id, so `limits\.memory\.swap` is
        // one name and not three.
        if (character === "\\") {
            parts[field] += leaf.slice(index, index + 2);
            index += 1;
            continue;
        }

        if (character === "#") {
            field = "id";
        } else if (character === ".") {
            field = "className";
        } else if (character === ":") {
            break;
        } else {
            parts[field] += character;
        }
    }

    return parts;
};

const generalise = (selector) => {
    const { tag, id, className } = splitLeaf(selector.split(" > ").pop() ?? selector);
    if (className !== "")
        return `${tag}.${className}`;
    return id === "" ? tag : `${tag}#${id}`;
};

/**
 * Rewrite the file from the current findings, with a TODO reason on every new
 * entry.
 *
 * Findings sharing a rule, a generalised selector and a measurement become one
 * entry, and one that appears under more than one scenario becomes a wildcard
 * rather than a row per page. Existing reasons are carried across on an exact
 * match, so regenerating after a PatternFly upgrade does not throw away the
 * justifications that still apply.
 */
export const writeBaseline = async (findings, existing) => {
    const groups = new Map();

    for (const finding of findings) {
        const selector = generalise(finding.selector);
        const key = [finding.rule, selector, finding.value].join(" :: ");
        const group = groups.get(key) ?? {
            rule: finding.rule,
            selector,
            value: finding.value,
            scenarios: new Set(),
        };
        group.scenarios.add(finding.scenario);
        groups.set(key, group);
    }

    const waivers = [...groups.values()].map((group) => {
        const previous = existing.find((waiver) =>
            waiver.rule === group.rule &&
            waiver.selector === group.selector &&
            waiver.value === group.value);

        return {
            rule: group.rule,
            scenario: group.scenarios.size === 1 ? [...group.scenarios][0] : "*",
            selector: group.selector,
            value: group.value,
            reason: previous?.reason ?? "TODO",
            owner: previous?.owner ?? "heavycaffeiner",
        };
    });

    waivers.sort((a, b) =>
        a.rule.localeCompare(b.rule) ||
        a.selector.localeCompare(b.selector) ||
        a.value.localeCompare(b.value));

    await writeFile(WAIVERS_PATH, `${JSON.stringify({ version: 1, waivers }, null, 4)}\n`, "utf8");
    return waivers.length;
};
