/**
 * Verify the catalogues against the source.
 *
 * With key-based message ids there is no xgettext step to keep them honest: a
 * typo in a key compiles fine and shows the key in the UI. This is the check
 * that replaces extraction.
 *
 *   - every key used in src/ must exist in po/en.po, or the UI shows a key
 *   - every key in en.po must be used, or the catalogue accumulates dead text
 *   - every other catalogue may only contain keys en.po has
 *
 * Untranslated entries in a non-English catalogue are reported as coverage, not
 * as failures: a partial translation is a normal state and falls back cleanly.
 */
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const SRC = "src";
const PO = "po";

const walk = async (dir) => {
    const out = [];
    for (const entry of await readdir(dir)) {
        const full = path.join(dir, entry);
        if ((await stat(full)).isDirectory())
            out.push(...await walk(full));
        else if (/\.tsx?$/.test(entry))
            out.push(full);
    }
    return out;
};

const parseKeys = (text) => {
    const keys = new Map();
    const entries = text.split(/\n\s*\n/);
    for (const block of entries) {
        const idMatch = /msgid\s+"((?:[^"\\]|\\.)*)"/.exec(block);
        if (idMatch === null || idMatch[1] === "")
            continue;
        const strings = [...block.matchAll(/msgstr(?:\[\d+\])?\s+"((?:[^"\\]|\\.)*)"/g)]
            .map((m) => m[1]);
        keys.set(idMatch[1], strings.some((s) => s !== ""));
    }
    return keys;
};

/*
 * Call sites read text off the generated T accessor, so what is scanned for is
 * `T.area.slug` rather than a string. src/generated and the i18n module are
 * skipped because the tree is defined there: counting its own definition would
 * make every key look used.
 */
const english = parseKeys(await readFile(path.join(PO, "en.po"), "utf8"));

const used = new Set();
for (const file of await walk(SRC)) {
    if (file.includes(path.join("backend", "i18n")) || file.includes(path.join(SRC, "generated")))
        continue;
    const text = await readFile(file, "utf8");
    for (const m of text.matchAll(/\bT((?:\.[A-Za-z0-9_]+)+)/g)) {
        const full = m[1].slice(1);

        /*
         * A namespace on its own is a computed lookup, `T.actions[action]`,
         * which cannot be resolved by reading the source. Those keys are
         * reached by name somewhere else too, so skipping here loses nothing.
         */
        if (!full.includes("."))
            continue;

        /*
         * A match can also run past the key, as in `T.logs.body.split("\n")`.
         * The longest prefix naming a real key is the key; when no prefix does,
         * the whole path is reported so a typo still fails the build.
         */
        const segments = full.split(".");
        while (segments.length > 1 && !english.has(segments.join(".")))
            segments.pop();
        used.add(english.has(segments.join(".")) ? segments.join(".") : full);
    }
}

const missing = [...used].filter((k) => !english.has(k)).sort();
const unused = [...english.keys()].filter((k) => !used.has(k)).sort();
const untranslatedEnglish = [...english.entries()].filter(([, has]) => !has).map(([k]) => k);

let failed = false;

if (missing.length > 0) {
    failed = true;
    console.error(`\n${missing.length} key(s) used in src but absent from po/en.po:`);
    for (const key of missing)
        console.error(`  ${key}`);
}

if (unused.length > 0) {
    failed = true;
    console.error(`\n${unused.length} key(s) in po/en.po no longer used:`);
    for (const key of unused)
        console.error(`  ${key}`);
}

if (untranslatedEnglish.length > 0) {
    failed = true;
    console.error(`\n${untranslatedEnglish.length} key(s) with no English text:`);
    for (const key of untranslatedEnglish)
        console.error(`  ${key}`);
}

console.log(`\npo/en.po: ${english.size} keys, all used by src` + (failed ? " (see errors above)" : ""));

for (const file of (await readdir(PO)).filter((f) => f.endsWith(".po") && f !== "en.po")) {
    const locale = path.basename(file, ".po");
    const catalogue = parseKeys(await readFile(path.join(PO, file), "utf8"));
    const stray = [...catalogue.keys()].filter((k) => !english.has(k)).sort();
    const translated = [...catalogue.entries()].filter(([, has]) => has).length;

    if (stray.length > 0) {
        failed = true;
        console.error(`\npo/${file}: ${stray.length} key(s) not in en.po:`);
        for (const key of stray)
            console.error(`  ${key}`);
    }

    const percent = Math.round((translated / english.size) * 100);
    console.log(`po/${file}: ${translated}/${english.size} translated (${percent}%)`);
    void locale;
}

process.exit(failed ? 1 : 0);
