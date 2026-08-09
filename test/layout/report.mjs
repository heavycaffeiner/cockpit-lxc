/**
 * The report.
 *
 * A reader has to learn what is wrong without opening a log or a picture, which
 * is why every row names the element and the measurement rather than pointing at
 * a screenshot. The screenshots are evidence attached to a number; nothing in
 * the pass or fail decision reads a pixel.
 */
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { RULE_GROUPS } from "./rules/index.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
export const REPORT_JSON = path.join(here, "layout-report.json");
export const REPORT_MD = path.join(here, "layout-report.md");

/** Markdown table cells cannot carry a raw pipe or newline. */
const cell = (text) => String(text).replace(/\|/g, "\\|").replace(/\n/g, " ");

const groupOf = (rule) => rule[0];

const table = (findings) => {
    const lines = [
        "| Rule | Scenario | Viewport | Theme | Element | Measurement |",
        "|------|----------|----------|-------|---------|-------------|",
    ];
    for (const finding of findings) {
        lines.push(
            `| ${finding.rule} | ${cell(finding.scenario)} | ${finding.viewport} | ${finding.theme} ` +
            `| \`${cell(finding.selector)}\` | ${cell(finding.detail)} |`,
        );
    }
    return lines.join("\n");
};

export const writeReport = async ({ unwaived, waived, unused, matrix, image, skipped }) => {
    await writeFile(
        REPORT_JSON,
        `${JSON.stringify({ image, matrix, unwaived, waived, unused, skipped }, null, 2)}\n`,
        "utf8",
    );

    const lines = ["# Layout conformance", ""];

    lines.push(
        `Ran ${matrix.cells} cells: ${matrix.scenarios} scenarios by ${matrix.viewports} viewports ` +
        `by ${matrix.themes} themes.`,
        `Environment: \`${image}\`.`,
        "",
    );

    if (skipped.length > 0) {
        lines.push("## Not measured", "");
        for (const entry of skipped)
            lines.push(`- \`${cell(entry.cell)}\`: ${cell(entry.reason)}`);
        lines.push("");
    }

    if (unwaived.length === 0) {
        lines.push("No unwaived findings.", "");
    } else {
        for (const [key, group] of Object.entries(RULE_GROUPS)) {
            const findings = unwaived.filter((finding) => groupOf(finding.rule) === key);
            if (findings.length === 0)
                continue;
            lines.push(`## ${group.title} (${findings.length})`, "", table(findings), "");
        }
    }

    if (unused.length > 0) {
        lines.push(
            "## Unused waivers",
            "",
            "These matched nothing. If the defect is fixed, delete the waiver in the same commit as the fix.",
            "",
        );
        for (const { waiver, index } of unused)
            lines.push(`- \`${waiver.rule}\` \`${cell(waiver.selector)}\` (${cell(waiver.value)}), entry ${index}`);
        lines.push("");
    }

    lines.push(`Waived: ${waived.length}. Unwaived: ${unwaived.length}. Unused waivers: ${unused.length}.`, "");

    const markdown = lines.join("\n");
    await writeFile(REPORT_MD, markdown, "utf8");

    if (process.env.GITHUB_STEP_SUMMARY !== undefined)
        await writeFile(process.env.GITHUB_STEP_SUMMARY, markdown, { flag: "a" });

    return markdown;
};
