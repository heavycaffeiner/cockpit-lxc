import cockpit from "cockpit";

/**
 * Translation, routed through Cockpit's own gettext.
 *
 * Cockpit loads the compiled catalogue for the session's locale from po.js, so
 * a plugin that calls this gets the operator's language for free and stays in
 * step with the shell's own choice.
 *
 * This lives under src/backend because it is the one thing outside the driver
 * that genuinely needs the Cockpit object, and the boundary rule has no
 * exceptions. The re-export from the barrel is what the views import.
 */
export const _ = (message: string): string => cockpit.gettext(message);

/** Plural-aware translation. `count` selects the form. */
export const N_ = (singular: string, plural: string, count: number): string =>
    cockpit.ngettext(singular, plural, count);

/**
 * Interpolation, kept separate from translation so that a translator sees the
 * placeholder rather than a half-built sentence.
 */
export const format = (template: string, ...args: unknown[]): string =>
    cockpit.format(template, ...args);
