/**
 * Resolves the bare "cockpit" specifier to Cockpit's client library.
 *
 * Cockpit ships base1/cockpit.js as an IIFE that assigns `window.cockpit` and
 * exports nothing, so `import cockpit from "../base1/cockpit.js"` cannot work
 * and neither can an import map pointing at it. Cockpit's own pages load it with
 * a classic <script> tag and read the global; this plugin does the same, and
 * this module is the one place that touches it.
 *
 * tsconfig `paths` and the esbuild `alias` in build.js both point the "cockpit"
 * specifier here, so call sites keep the conventional import form and the
 * ESLint boundary rule keeps working on that specifier.
 */

/*
 * Resolved through a function rather than `export default api` after an
 * inline guard: a default export carries the declared type of the binding, not
 * the type narrowed at that point, so exporting the const directly would leak
 * `CockpitApi | undefined` to every call site.
 */
const resolve = (): CockpitApi => {
    const api = window.cockpit;

    if (api === undefined) {
        throw new Error(
            "cockpit-lxc: window.cockpit is not set. index.html must load " +
            "../base1/cockpit.js as a classic script before this bundle runs.",
        );
    }

    /*
     * Assert the surface this plugin actually calls.
     *
     * These declarations are hand-maintained against a library the plugin does
     * not bundle, so a name that is wrong or has moved is a live possibility.
     * It already happened once: cockpit.superuser does not exist on the base1
     * global, and the mistake surfaced as a TypeError inside a component rather
     * than as anything that named the cause. Failing here instead turns that
     * class of error into one line that says which name is missing.
     */
    for (const name of ["http", "channel", "spawn", "permission", "transport"] as const) {
        if (api[name] === undefined) {
            throw new Error(
                `cockpit-lxc: window.cockpit.${name} is missing. The declarations in ` +
                "src/types/cockpit.d.ts do not match the Cockpit on this host.",
            );
        }
    }

    return api;
};

export default resolve();
