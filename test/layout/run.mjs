#!/usr/bin/env node
/**
 * The layout audit.
 *
 * Loads the shipped bundle in a headless browser, measures every visible
 * element, applies the rules, reconciles against waivers.json, and exits 0 only
 * when every finding is waived.
 *
 * --update-waivers   rewrite waivers.json from the current findings, with a TODO
 *                    reason on each new entry. Always exits 1: a generated
 *                    baseline is not a passing run.
 * --scenario <glob>  narrow the matrix for local iteration
 * --viewport <name>  narrow the matrix for local iteration
 * --theme <name>     narrow the matrix for local iteration
 *
 * The narrowing flags are refused when CI is set, so a narrowed matrix cannot
 * pass for a full one.
 */
import { mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

import { applyOverrides, loadBase } from "./fixtures.mjs";
import { REPORT_MD, writeReport } from "./report.mjs";
import { evaluate } from "./rules/index.mjs";
import { SCENARIOS, THEMES, VIEWPORTS } from "./scenarios.mjs";
import { startServer } from "./server.mjs";
import { loadWaivers, reconcile, writeBaseline } from "./waivers.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const screenshotDir = path.join(here, "screenshots");

/**
 * A constant instant, so relative and absolute timestamps render the same way on
 * every run. A label that ticks from "2 minutes ago" to "3 minutes ago" is a box
 * whose width changes between two measurements of the same page.
 */
const FIXED_TIME = new Date("2026-02-01T12:00:00Z");

const READINESS_TIMEOUT_MS = 15_000;
/**
 * Stability samples, and the gap between them.
 *
 * Spaced rather than on adjacent animation frames. src/hooks/use-containers.ts
 * subscribes to the admin permission and reloads when it changes, so the shim's
 * permission answer triggers a second full data load a tick after the first
 * finishes. Two frames 16ms apart can both land inside that window and report a
 * page that is about to change as settled.
 */
const STABLE_SAMPLES = 3;
const STABLE_INTERVAL_MS = 120;

const parseArgs = (argv) => {
    const args = { updateWaivers: false, scenario: null, viewport: null, theme: null };
    for (let index = 0; index < argv.length; index += 1) {
        const flag = argv[index];
        if (flag === "--update-waivers")
            args.updateWaivers = true;
        else if (flag === "--scenario")
            args.scenario = argv[index += 1];
        else if (flag === "--viewport")
            args.viewport = argv[index += 1];
        else if (flag === "--theme")
            args.theme = argv[index += 1];
        else
            throw new Error(`unknown flag: ${flag}`);
    }
    return args;
};

const matchesGlob = (pattern, value) =>
    pattern === null || (pattern.endsWith("*") ? value.startsWith(pattern.slice(0, -1)) : pattern === value);

/**
 * Wait until the page has stopped moving.
 *
 * Four conditions, in order of what each rules out: the application's own
 * spinner is gone, so it has data; the fonts have swapped, so text is measured
 * in the face it will ship with; the scenario's own landmark is visible, so a
 * step that silently failed is a timeout with a clear message rather than a
 * clean measurement of the wrong page; and consecutive samples agree, which
 * covers everything the first three do not model.
 */
const measureWhenStable = async (page, probeConfig) => {
    /*
     * Every scroller back to its origin. A scroll offset is not a design
     * decision, and it moves geometry: clicking an expandable section during
     * setup scrolls the page's main area, after which its first child measures
     * 2300px above its own content edge. Measuring at the origin is measuring
     * the page as it is first presented.
     */
    await page.evaluate(() => {
        window.scrollTo(0, 0);
        for (const element of document.querySelectorAll("*")) {
            element.scrollTop = 0;
            element.scrollLeft = 0;
        }
    });

    await page.waitForFunction(
        () => document.querySelectorAll(".pf-v6-c-spinner").length === 0,
        undefined,
        { timeout: READINESS_TIMEOUT_MS },
    );

    let previous = null;
    let agreements = 0;
    const deadline = Date.now() + READINESS_TIMEOUT_MS;

    while (Date.now() < deadline) {
        const observations = await page.evaluate(
            (config) => window.__lxcProbe(config),
            probeConfig,
        );
        const serialised = JSON.stringify(observations);

        if (serialised === previous) {
            agreements += 1;
            if (agreements >= STABLE_SAMPLES - 1)
                return observations;
        } else {
            agreements = 0;
            previous = serialised;
        }

        await page.waitForTimeout(STABLE_INTERVAL_MS);
    }

    throw new Error(
        `the page was still changing after ${READINESS_TIMEOUT_MS}ms. ` +
        "Something is animating, polling, or refetching without settling.",
    );
};

/** Outline the offending boxes, then capture. The markers are ignored by any re-probe. */
const capture = async (page, findings, file) => {
    await page.evaluate((boxes) => {
        for (const box of boxes) {
            const marker = document.createElement("div");
            marker.setAttribute("data-lxc-audit-harness", "");
            marker.style.cssText = [
                "position:absolute",
                `top:${box.top}px`,
                `left:${box.left}px`,
                `width:${box.width}px`,
                `height:${box.height}px`,
                "outline:2px solid #f00",
                "outline-offset:0",
                "background:rgba(255,0,0,0.06)",
                "pointer-events:none",
                "z-index:2147483647",
            ].join(";");
            document.body.append(marker);
        }
    }, findings.map((finding) => finding.rect));

    // Full page rather than viewport: a finding below the fold would otherwise
    // be a picture of the top of the page.
    await page.screenshot({ path: file, fullPage: true });
};

const runCell = async (browser, origin, bundle, scenario, viewport, theme, probeConfig) => {
    const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: 1,
        colorScheme: theme,
        reducedMotion: "reduce",
        // Fixed, because src/views renders timestamps through the platform's own
        // formatters and both of these change the string, and so the box.
        locale: "en-US",
        timezoneId: "UTC",
    });

    try {
        await context.clock.setFixedTime(FIXED_TIME);
        await context.addInitScript((payload) => {
            window.__lxcHarness = payload.bundle;
            try {
                window.localStorage.setItem("cockpit-lxc:prefs", JSON.stringify(payload.prefs));
                // src/theme.ts reads this first and consults the OS preference
                // only when it is "auto", which is what puts the context's
                // colorScheme in charge of the theme.
                window.localStorage.setItem("shell:style", "auto");
            } catch {
                // A blocked origin would mean the defaults apply, which is a
                // different scenario than the one asked for, so the readiness
                // gate will fail rather than this being silently wrong.
            }
        }, { bundle, prefs: scenario.prefs ?? {} });

        const page = await context.newPage();

        const consoleErrors = [];
        page.on("pageerror", (error) => consoleErrors.push(error.message));

        await page.goto(`${origin}/_harness/harness.html`, { waitUntil: "domcontentloaded" });

        // Transitions and animations do not affect final layout, so zeroing them
        // changes no measurement. It removes the window in which one could be
        // taken mid-flight.
        await page.addStyleTag({
            content: "*,*::before,*::after{transition-duration:0s!important;animation-duration:0s!important;animation-delay:0s!important}",
        });

        await page.evaluate(() => document.fonts.ready);
        await page.waitForFunction(
            () => document.querySelectorAll(".pf-v6-c-spinner").length === 0,
            undefined,
            { timeout: READINESS_TIMEOUT_MS },
        );

        if (scenario.steps !== undefined)
            await scenario.steps(page);

        /*
         * Visible matches only. PatternFly keeps every tab panel in the DOM and
         * hides the inactive ones, so a plain `.first()` routinely resolves to a
         * copy of the landmark that lives on another tab and will never be
         * shown. That waits out the whole timeout and reports a step failure for
         * a page that rendered exactly as intended.
         */
        if (scenario.expect !== undefined) {
            await page.locator(scenario.expect)
                .filter({ visible: true })
                .first()
                .waitFor({ state: "visible", timeout: READINESS_TIMEOUT_MS });
        }

        if (consoleErrors.length > 0) {
            throw new Error(
                `the page raised ${consoleErrors.length} uncaught error(s), so what rendered is not ` +
                `what this scenario describes: ${consoleErrors[0]}`,
            );
        }

        const observations = await measureWhenStable(page, probeConfig);
        if (observations.length === 0) {
            throw new Error(
                "the probe returned no observations. The audit set is misconfigured or the page did " +
                "not mount, and a rule pass over an empty array is vacuously green.",
            );
        }

        return { observations, page, context };
    } catch (error) {
        await context.close();
        throw error;
    }
};

const main = async () => {
    const args = parseArgs(process.argv.slice(2));
    const narrowed = args.scenario !== null || args.viewport !== null || args.theme !== null;

    if (narrowed && process.env.CI !== undefined) {
        process.stderr.write("the narrowing flags are for local iteration and are refused under CI, " +
            "so a partial matrix cannot report itself as a full one\n");
        process.exit(1);
    }

    const config = JSON.parse(await readFile(path.join(here, "config.json"), "utf8"));
    const image = JSON.parse(await readFile(path.join(here, "image.json"), "utf8"));
    const waivers = await loadWaivers({ allowTodo: args.updateWaivers });

    const scenarios = SCENARIOS.filter((scenario) => matchesGlob(args.scenario, scenario.id));
    const viewports = VIEWPORTS.filter((viewport) => matchesGlob(args.viewport, viewport.name));
    const themes = THEMES.filter((theme) => matchesGlob(args.theme, theme));

    if (scenarios.length === 0 || viewports.length === 0 || themes.length === 0) {
        process.stderr.write("the filters selected nothing to run\n");
        process.exit(1);
    }

    const probeConfig = {
        excludeSelectors: config.excludeSelectors,
        groupingSelectors: config.groupingSelectors,
        interactiveSelector: config.interactiveSelector,
        sectionRootSelector: config.sectionRootSelector,
        waiverSelectors: waivers.map((waiver) => waiver.selector),
    };

    await rm(screenshotDir, { recursive: true, force: true });
    await mkdir(screenshotDir, { recursive: true });

    const base = await loadBase();
    const server = await startServer();
    const browser = await chromium.launch();

    const findings = [];
    const skipped = [];
    let cells = 0;

    try {
        for (const scenario of scenarios) {
            const bundle = await applyOverrides(base, scenario.overrides);

            for (const viewport of viewports) {
                for (const theme of themes) {
                    const cell = `${scenario.id} ${viewport.name} ${theme}`;
                    cells += 1;

                    let result;
                    try {
                        result = await runCell(
                            browser, server.origin, bundle, scenario, viewport, theme, probeConfig,
                        );
                    } catch (error) {
                        // Never retried. A flaky readiness condition is a defect
                        // in the harness, and retrying hides it while leaving it
                        // in place.
                        skipped.push({ cell, reason: error.message });
                        process.stderr.write(`FAIL ${cell}: ${error.message}\n`);
                        continue;
                    }

                    const found = evaluate(result.observations, config, {
                        scenario: scenario.id,
                        viewport: viewport.name,
                        theme,
                    });
                    findings.push(...found);

                    const { unwaived } = reconcile(found, waivers);
                    if (unwaived.length > 0) {
                        await capture(
                            result.page,
                            unwaived,
                            path.join(screenshotDir, `${scenario.id.replace(/\//g, "-")}-${viewport.name}-${theme}.png`),
                        );
                    }

                    await result.context.close();
                    process.stdout.write(
                        `${unwaived.length === 0 ? "ok  " : "FAIL"} ${cell} ` +
                        `(${result.observations.length} elements, ${unwaived.length} unwaived)\n`,
                    );
                }
            }
        }
    } finally {
        await browser.close();
        await server.close();
    }

    const { waived, unwaived, unused } = reconcile(findings, waivers);

    await writeReport({
        unwaived,
        waived,
        unused,
        skipped,
        image: image.image,
        matrix: {
            cells,
            scenarios: scenarios.length,
            viewports: viewports.length,
            themes: themes.length,
        },
    });

    if (narrowed)
        process.stdout.write("note: the matrix was narrowed by a flag, so this run does not cover everything\n");

    process.stdout.write(`\nreport written to ${path.relative(process.cwd(), REPORT_MD)}\n`);

    // The report is written first, because deciding whether a generated entry
    // deserves a reason means reading the finding it came from.
    if (args.updateWaivers) {
        const written = await writeBaseline(findings, waivers);
        process.stderr.write(
            `wrote ${written} waiver(s) to test/layout/waivers.json, each with a TODO reason.\n` +
            "Every one needs a written justification before it can be merged, which is the point:\n" +
            "a generated baseline is a list of questions, not an answer.\n",
        );
        process.exit(1);
    }

    const failed = unwaived.length > 0 || unused.length > 0 || skipped.length > 0;
    if (failed) {
        process.stderr.write(
            `\n${unwaived.length} unwaived finding(s), ${unused.length} unused waiver(s), ` +
            `${skipped.length} cell(s) that could not be measured\n`,
        );
    }
    process.exit(failed ? 1 : 0);
};

await main();
