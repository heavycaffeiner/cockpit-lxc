/**
 * Follow Cockpit's dark/light theme.
 *
 * Cockpit does not style plugin frames for you. Every one of its own pages
 * carries this logic itself, and a plugin that skips it stays light while the
 * shell around it goes dark. The algorithm below matches Cockpit 356.2's
 * cockpit-dark-theme module exactly, because a plugin that resolves the theme
 * differently is worse than one that ignores it: it would disagree with the
 * shell on some settings and not others.
 *
 * Three inputs, in Cockpit's order of precedence:
 *
 *   - an explicit style carried by the `cockpit-style` CustomEvent, which the
 *     shell fires in its own window when the operator picks a theme
 *   - localStorage "shell:style", which the shell also writes, and which reaches
 *     this frame as a `storage` event because the frame is same-origin
 *   - the OS preference, consulted only when the setting is "auto"
 */

const DARK_CLASS = "pf-v6-theme-dark";
const STYLE_KEY = "shell:style";
const DARK_QUERY = "(prefers-color-scheme: dark)";

const storedStyle = (): string => {
    try {
        return localStorage.getItem(STYLE_KEY) ?? "auto";
    } catch {
        // Storage can throw when it is disabled. Light is the safer default: it
        // matches Cockpit's own fallback.
        return "auto";
    }
};

const apply = (style?: string): void => {
    const setting = style ?? storedStyle();
    const dark = setting === "dark" ||
        (setting === "auto" && window.matchMedia(DARK_QUERY).matches);

    document.documentElement.classList.toggle(DARK_CLASS, dark);
};

/**
 * Start following the theme. Returns a teardown function.
 *
 * Called once at startup rather than from a component, because the class goes on
 * the document element and has nothing to do with any particular view.
 */
export const followCockpitTheme = (): (() => void) => {
    apply();

    const onStorage = (event: StorageEvent) => {
        if (event.key === STYLE_KEY)
            apply();
    };

    const onCockpitStyle = (event: Event) => {
        if (event instanceof CustomEvent) {
            const style: unknown = event.detail?.style;
            apply(typeof style === "string" ? style : undefined);
        }
    };

    const media = window.matchMedia(DARK_QUERY);
    // Only meaningful while the setting is "auto"; apply() re-reads it, so the
    // OS flipping theme while the operator has pinned light or dark is ignored.
    const onMediaChange = () => apply();

    window.addEventListener("storage", onStorage);
    window.addEventListener("cockpit-style", onCockpitStyle);
    media.addEventListener("change", onMediaChange);

    return () => {
        window.removeEventListener("storage", onStorage);
        window.removeEventListener("cockpit-style", onCockpitStyle);
        media.removeEventListener("change", onMediaChange);
    };
};
