/**
 * The states worth measuring, and how to reach each one.
 *
 * Where a state is reachable by seeding localStorage it is, because a click that
 * has to find a translated label is a step that can fail for a reason unrelated
 * to layout. src/prefs.ts holds the open page and the open detail tab under one
 * key, so most of the matrix costs no interaction at all.
 *
 * The non-nominal scenarios are here deliberately. An empty state, a degraded
 * banner and a startup failure are the pages least often looked at by hand, and
 * therefore the ones most likely to be misaligned.
 *
 * Each scenario is:
 *   id        stable name, used in the report and in waiver matching
 *   prefs     merged into the cockpit-lxc:prefs localStorage key
 *   overrides fixture overrides, see fixtures.mjs
 *   steps     async (page) => void, run after load and before the readiness gate
 *   expect    a selector that must be visible before measuring
 */

const CONTAINER_LINK = 'button:has-text("web01"), a:has-text("web01")';

/**
 * Open the detail view for web01 and wait for it to have loaded.
 *
 * The click mounts a view that fetches the container with its ETag, so the tab
 * body arrives a round trip later. A step that starts looking for controls
 * before then finds none, does nothing, and leaves the scenario measuring a page
 * it never reached.
 */
const openDetail = async (page) => {
    await page.locator(CONTAINER_LINK).first().click();
    await page.locator(".lxc-detail__header").waitFor({ state: "visible" });
    await page.waitForFunction(() => document.querySelectorAll(".pf-v6-c-spinner").length === 0);
};

export const SCENARIOS = [
    {
        id: "containers/list",
        prefs: { page: "containers" },
        expect: "table tbody tr",
    },
    {
        id: "containers/list-empty",
        prefs: { page: "containers" },
        overrides: {
            responses: { "GET /1.0/instances?recursion=2": { status: 200, file: "empty-list.json" } },
        },
        // The empty state, not the table. Asserting on the table here would
        // wait out the full timeout and report a step failure for a page that
        // rendered exactly as intended.
        expect: ".pf-v6-c-empty-state",
    },
    {
        id: "containers/list-selected",
        prefs: { page: "containers" },
        // The bulk bar only exists once something is selected, and it is the
        // widest toolbar the list ever shows.
        steps: async (page) => {
            await page.locator("table tbody tr input[type=checkbox]").first().check();
        },
        expect: ".lxc-bulk",
    },
    {
        id: "containers/degraded",
        prefs: { page: "containers" },
        overrides: {
            processes: {
                "incus monitor --format=json --type=lifecycle": { problem: "terminated" },
            },
        },
        expect: ".lxc-degraded",
    },
    {
        id: "containers/create-dialog",
        prefs: { page: "containers" },
        steps: async (page) => {
            await page.getByRole("button", { name: "Create container" }).first().click();
        },
        expect: ".pf-v6-c-modal-box",
    },
    {
        id: "detail/overview",
        prefs: { page: "containers", detailTab: "overview" },
        steps: openDetail,
        expect: ".lxc-detail__header",
    },
    {
        id: "detail/configuration",
        prefs: { page: "containers", detailTab: "configuration" },
        steps: openDetail,
        expect: ".lxc-config",
    },
    {
        id: "detail/configuration-generated-expanded",
        prefs: { page: "containers", detailTab: "configuration" },
        steps: async (page) => {
            await openDetail(page);
            // Every generated group at once. One expanded section would measure
            // the indent rule in src/app.scss; all of them measure whether the
            // groups agree with each other.
            //
            // The button, not the toggle wrapper: the wrapper is full width and
            // the button sits at its start, so a click on the wrapper's centre
            // lands on empty space and silently does nothing.
            const toggles = page
                .locator(".lxc-config__generated .pf-v6-c-expandable-section__toggle button")
                .filter({ visible: true });
            await toggles.first().waitFor({ state: "visible" });
            const count = await toggles.count();
            for (let index = 0; index < count; index += 1)
                await toggles.nth(index).click();
        },
        expect: ".lxc-config__generated .pf-v6-c-expandable-section__content",
    },
    /*
     * There is no separate raw-editor scenario. The raw key/value table renders
     * unconditionally on the configuration tab rather than behind a disclosure,
     * so `detail/configuration` already measures it and a scenario that expanded
     * something to reach it measured the generated groups a second time instead.
     */
    {
        id: "detail/devices-network",
        prefs: { page: "containers", detailTab: "network" },
        steps: openDetail,
        expect: ".lxc-devices",
    },
    {
        id: "detail/devices-storage",
        prefs: { page: "containers", detailTab: "storage" },
        steps: openDetail,
        expect: ".lxc-devices",
    },
    {
        id: "detail/snapshots",
        prefs: { page: "containers", detailTab: "snapshots" },
        steps: openDetail,
        expect: ".lxc-snapshots",
    },
    {
        id: "detail/logs",
        prefs: { page: "containers", detailTab: "logs" },
        steps: openDetail,
        expect: ".lxc-logs__body",
    },
    {
        id: "detail/terminal",
        prefs: { page: "containers", detailTab: "terminal" },
        steps: openDetail,
        expect: ".lxc-terminal__viewport",
    },
    {
        id: "images/list",
        prefs: { page: "images" },
        expect: ".lxc-imagestore",
    },
    {
        id: "images/remote-catalogue",
        prefs: { page: "images" },
        steps: async (page) => {
            // The image sub-tabs, by position rather than by label: the label is
            // translated and the position is not.
            await page.locator(".pf-v6-c-tabs.pf-m-subtab [role=tab]").nth(1).click();
        },
        expect: ".lxc-catalogue",
    },
    {
        id: "profiles/list",
        prefs: { page: "profiles" },
        expect: "table tbody tr",
    },
    {
        id: "networks/list",
        prefs: { page: "networks" },
        expect: "table tbody tr",
    },
    {
        id: "storage/list",
        prefs: { page: "storage" },
        expect: "table tbody tr",
    },
    {
        id: "startup/not-installed",
        prefs: { page: "containers" },
        overrides: { transportProblem: "not-found" },
        expect: ".pf-v6-c-empty-state",
    },
    {
        id: "startup/access-denied",
        prefs: { page: "containers" },
        overrides: { transportProblem: "access-denied" },
        expect: ".pf-v6-c-empty-state",
    },
];

/** Every viewport width is a multiple of 4, so a full-width child is never off grid for a reason the stylesheet did not cause. */
export const VIEWPORTS = [
    // PatternFly's md breakpoint: where toolbars wrap and the list drops columns.
    { name: "narrow", width: 768, height: 1024 },
    // A 1536px window with Cockpit's shell sidebar open. The common case.
    { name: "default", width: 1280, height: 800 },
    // Where the fixed-width controls stop being the constraint and the flex
    // distribution around them takes over.
    { name: "wide", width: 1600, height: 900 },
];

export const THEMES = ["light", "dark"];
