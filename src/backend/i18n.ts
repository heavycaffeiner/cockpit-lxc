import cockpit from "cockpit";

import {
    EN_CATALOGUE,
    EN_PLURAL,
    K,
    PLURAL_KEYS,
    type MessageKey,
    type PluralKey,
} from "../generated/catalogue-en";

/**
 * Translation, reached as `T.list.create_container`.
 *
 * Message ids are stable keys, never English sentences. Using the source text as
 * the identifier, which is the GNU gettext convention, means every edit to the
 * English copy silently orphans every translation of it: the msgid changes, the
 * catalogues no longer match, and the UI quietly falls back to English without
 * anything failing. Keys do not move when wording does.
 *
 * `T` mirrors the generated key tree, so a call site reads a property instead of
 * spelling a key into a function. A typo is a compile error rather than a key
 * rendered into the UI, and an editor can complete and rename them. Entries with
 * plural forms come out as functions of a count, `T.snapshots.day_ago(3)`, so
 * there is one way to reach a string rather than two.
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
    // The session's catalogue first, then the bundled English underneath it.
    return catalogues[sessionLocale()]?.[key] ?? EN_CATALOGUE[key];
};

/**
 * Returns the key itself when nothing has it, which is deliberately ugly: a key
 * showing through in the UI is a missing entry in en.po, and that should be
 * obvious rather than blend in.
 */
const translate = (key: MessageKey): string => {
    const entry = lookup(key);
    if (entry === undefined)
        return key;
    return Array.isArray(entry) ? entry[0] ?? key : entry;
};

/**
 * The plural form `count` selects.
 *
 * The selector comes from the catalogue's own Plural-Forms header, so a language
 * with one form and one with several are each handled by their own rule rather
 * than by an English assumption baked in here.
 */
const pluralize = (key: MessageKey, count: number): string => {
    const entry = lookup(key);
    if (entry === undefined)
        return key;
    if (!Array.isArray(entry))
        return entry;

    const select = registry().plurals[sessionLocale()] ?? EN_PLURAL;
    return entry[select(count)] ?? entry[0] ?? key;
};

type Leaf<S extends string> = S extends PluralKey ? (count: number) => string : string;

type Accessor<Node> = {
    readonly [Name in keyof Node]: Node[Name] extends string
        ? Leaf<Node[Name]>
        : Accessor<Node[Name]>;
};

/**
 * Mirror the key tree with one that yields text.
 *
 * Singular entries are getters rather than precomputed values because the
 * catalogue arrives with the page while module-scope constants are built at
 * import time; reading at access time is what lets a spec object declared at
 * module scope still come out translated.
 */
const accessor = (node: Record<string, unknown>): Record<string, unknown> => {
    const out: Record<string, unknown> = {};
    for (const [name, value] of Object.entries(node)) {
        if (typeof value !== "string") {
            out[name] = accessor(value as Record<string, unknown>);
        } else if (PLURAL_KEYS.has(value)) {
            out[name] = (count: number) => pluralize(value as MessageKey, count);
        } else {
            Object.defineProperty(out, name, {
                get: () => translate(value as MessageKey),
                enumerable: true,
            });
        }
    }
    return out;
};

export const T = accessor(K) as Accessor<typeof K>;

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
