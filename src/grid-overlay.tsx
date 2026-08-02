import "./grid-overlay.scss";

/**
 * Development-only 4px baseline overlay, toggled with ?grid=1.
 *
 * Paints a 4px repeating grid over the whole page so that misalignment is
 * visible while building a view, rather than being discovered later by eye.
 * The stylelint rule in build/stylelint-4px-grid.js catches off-grid literals;
 * this catches the cases that are on-grid individually but wrong in aggregate,
 * such as a component that is correctly spaced but sits half a step off because
 * of an ancestor.
 *
 * process.env.NODE_ENV is substituted at build time by esbuild's define, so a
 * production bundle constant-folds this to null and drops the markup entirely.
 */
export const GridOverlay = () => {
    if (process.env.NODE_ENV === "production")
        return null;

    const enabled = new URLSearchParams(window.location.search).get("grid") === "1";
    if (!enabled)
        return null;

    return <div className="lxc-grid-overlay" aria-hidden="true" />;
};
