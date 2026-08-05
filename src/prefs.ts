import { useCallback, useState } from "react";

/**
 * Browser-local presentation state.
 *
 * Nothing here is authoritative and nothing here is container data: it is which
 * tab was open, how the table was sorted, which columns were showing and how
 * large the terminal font was. Incus holds everything that matters, so clearing
 * this is always safe, and a malformed or absent value falls back to a default
 * rather than breaking the page.
 *
 * One key rather than several, so a partial write cannot leave two preferences
 * disagreeing about which session wrote them.
 */
const STORAGE_KEY = "cockpit-lxc:prefs";

export interface Prefs {
    /** Which top-level page was last open. */
    page: string;
    /** Which container detail tab was last open. */
    detailTab: string;
    sortColumn: string;
    sortDirection: "asc" | "desc";
    pageSize: number;
    /** Container list columns the operator has turned off. */
    hiddenColumns: readonly string[];
    terminalFontSize: number;
}

const DEFAULTS: Prefs = {
    page: "containers",
    detailTab: "overview",
    sortColumn: "name",
    sortDirection: "asc",
    pageSize: 20,
    hiddenColumns: [],
    terminalFontSize: 14,
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null;

/**
 * localStorage is a trust boundary like any other: another script on the origin
 * can write it, and a previous version of this plugin may have written a shape
 * this one no longer understands. Every field is checked, and one bad field
 * costs only that field.
 */
const read = (): Prefs => {
    let parsed: unknown;
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw === null)
            return DEFAULTS;
        parsed = JSON.parse(raw);
    } catch {
        return DEFAULTS;
    }

    if (!isRecord(parsed))
        return DEFAULTS;

    const text = (name: keyof Prefs, fallback: string): string =>
        typeof parsed[name] === "string" ? parsed[name] : fallback;

    const number = (name: keyof Prefs, fallback: number, min: number, max: number): number => {
        const value = parsed[name];
        return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max
            ? Math.round(value)
            : fallback;
    };

    const hidden = parsed["hiddenColumns"];

    return {
        page: text("page", DEFAULTS.page),
        detailTab: text("detailTab", DEFAULTS.detailTab),
        sortColumn: text("sortColumn", DEFAULTS.sortColumn),
        sortDirection: parsed["sortDirection"] === "desc" ? "desc" : "asc",
        pageSize: number("pageSize", DEFAULTS.pageSize, 5, 500),
        hiddenColumns: Array.isArray(hidden)
            ? hidden.filter((entry): entry is string => typeof entry === "string")
            : DEFAULTS.hiddenColumns,
        terminalFontSize: number("terminalFontSize", DEFAULTS.terminalFontSize, 8, 32),
    };
};

const write = (prefs: Prefs): void => {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    } catch {
        // Private browsing, a full quota, or a blocked origin. A preference
        // that does not persist is not worth failing a page over.
    }
};

/**
 * Read and update the stored preferences.
 *
 * Each caller keeps its own copy in state, which is fine because the values are
 * presentation-only and every writer merges rather than replaces.
 */
export const usePrefs = (): [Prefs, (patch: Partial<Prefs>) => void] => {
    const [prefs, setPrefs] = useState<Prefs>(read);

    const update = useCallback((patch: Partial<Prefs>) => {
        setPrefs((current) => {
            const next = { ...current, ...patch };
            write(next);
            return next;
        });
    }, []);

    return [prefs, update];
};
