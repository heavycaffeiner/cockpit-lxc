import cockpit from "cockpit";

import { EN_CATALOGUE, EN_PLURAL, type MessageKey } from "../generated/catalogue-en";

export { K, type MessageKey } from "../generated/catalogue-en";

/**
 * Key-based translation with English as the fallback.
 *
 * Call sites pass a stable key such as `K.list.create_container`, never an
 * English sentence. Using the source text as the identifier, which is the GNU
 * gettext convention, means every edit to the English copy silently orphans
 * every translation of it: the msgid changes, the catalogues no longer match,
 * and the UI quietly falls back to English without anything failing. Keys do
 * not move when wording does.
 *
 * The keys are reached through the generated `K` object rather than written out
 * as strings, so a mistyped key fails to compile instead of rendering as itself,
 * and `MessageKey` closes the same hole for a string written by hand.
 *
 * `po/en.po` is a catalogue like any other rather than an implicit default, so
 * the English strings live in one reviewable place instead of being scattered
 * through the components.
 *
 * Two catalogues are live at once: English, which is bundled, and the session's
 * own, layered over it. A key the translator has not reached yet therefore
 * renders in English rather than showing its key.
 *
 * English is bundled rather than fetched because Cockpit serves exactly one
 * translation file per package, `po.js`, resolved from the request's
 * Accept-Language. Asking for `po.en.js` by name returns 404, even for
 * Cockpit's own packages, and a session in a language with no catalogue gets an
 * empty `po.js` rather than a fallback. Loading English over the network is
 * therefore not something this can rely on.
 */

type Catalogue = Record<string, string | string[]>;

interface CatalogueRegistry {
    /** Locale code to catalogue, populated by the po.<locale>.js files. */
    catalogues: Record<string, Catalogue>;
    /** Plural selector per locale, compiled from the catalogue's header. */
    plurals: Record<string, (n: number) => number>;
}

declare global {
    interface Window {
        cockpitLxcI18n?: CatalogueRegistry;
    }
}

const registry = (): CatalogueRegistry => {
    if (window.cockpitLxcI18n === undefined)
        window.cockpitLxcI18n = { catalogues: {}, plurals: {} };
    return window.cockpitLxcI18n;
};

const FALLBACK_LOCALE = "en";

/**
 * Which catalogue this session should read.
 *
 * `cockpit.language` is consulted first, normalised to a base language because
 * Cockpit reports regional forms like "ko-kr" while catalogues are named by
 * language alone.
 *
 * When that language has no catalogue, whatever Cockpit actually served through
 * po.js wins. The two can disagree: Cockpit has been observed reporting "en"
 * while serving the Korean catalogue, and following the report rather than the
 * delivery would leave the plugin in English inside a Korean shell. Cockpit
 * chose which file to send, so that choice is the more reliable signal of what
 * the operator is reading.
 */
const sessionLocale = (): string => {
    const { catalogues } = registry();

    const language = cockpit.language;
    if (typeof language === "string" && language !== "") {
        const base = language.toLowerCase().replace("_", "-").split("-")[0];
        if (base !== undefined && catalogues[base] !== undefined)
            return base;
    }

    // Cockpit serves exactly one catalogue, so anything loaded is its decision.
    const loaded = Object.keys(catalogues);
    return loaded.length === 1 ? loaded[0] ?? FALLBACK_LOCALE : FALLBACK_LOCALE;
};

const lookup = (key: MessageKey): string | string[] | undefined => {
    const { catalogues } = registry();
    const locale = sessionLocale();
    // The session's catalogue first, then the bundled English underneath it.
    return catalogues[locale]?.[key] ?? EN_CATALOGUE[key];
};

/**
 * Translate a key.
 *
 * Returns the key itself when nothing has it, which is deliberately ugly: a key
 * showing through in the UI is a missing entry in en.po, and that should be
 * obvious rather than blend in.
 */
export const _ = (key: MessageKey): string => {
    const entry = lookup(key);
    if (entry === undefined)
        return key;
    return Array.isArray(entry) ? entry[0] ?? key : entry;
};

/**
 * Translate a key with a plural form selected by `count`.
 *
 * The selector comes from the catalogue's own Plural-Forms header, so a
 * language with one form or with several is handled by its own rule rather than
 * by an English assumption baked in here.
 */
export const N_ = (key: MessageKey, count: number): string => {
    const { plurals } = registry();
    const locale = sessionLocale();
    const entry = lookup(key);

    if (entry === undefined)
        return key;
    if (!Array.isArray(entry))
        return entry;

    const select = plurals[locale] ?? EN_PLURAL;
    const index = select(count);
    return entry[index] ?? entry[0] ?? key;
};

/**
 * Substitute $0, $1, ... into a translated string.
 *
 * Kept separate from translation so a translator sees the placeholder and can
 * move it, which matters in languages that order the parts differently.
 */
export const format = (template: string, ...args: unknown[]): string =>
    template.replace(/\$(\d+)/g, (match, index: string) => {
        const value = args[Number(index)];
        return value === undefined ? match : String(value);
    });
