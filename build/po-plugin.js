/**
 * Compile .po catalogues into the JavaScript form Cockpit loads.
 *
 * Cockpit expects each package to ship `po.<locale>.js`, a classic script that
 * calls cockpit.locale() with a JSON catalogue. It does not read .po or .mo at
 * runtime, so this conversion has to happen at build time.
 *
 * The format is deliberately the same one cockpit's own build produces, because
 * the loader is Cockpit's and not ours to change.
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Minimal .po reader.
 *
 * It handles the subset this project produces: msgid, msgstr, plural forms and
 * continuation lines. Anything it does not understand is skipped rather than
 * guessed at, because a mistranslated catalogue is worse than an untranslated
 * one.
 */
const parsePo = (text) => {
    const entries = {};
    let header = "";
    let current = null;

    const flush = () => {
        if (current === null)
            return;
        if (current.id === "")
            header = current.strings[0] ?? "";
        else if (current.strings.some((s) => s !== ""))
            entries[current.id] = current.plural === null
                ? [null, ...current.strings]
                : [current.plural, ...current.strings];
        current = null;
    };

    const unquote = (line) => {
        const match = /"((?:[^"\\]|\\.)*)"/.exec(line);
        if (match === null)
            return "";
        return match[1]
            .replace(/\\n/g, "\n")
            .replace(/\\t/g, "\t")
            .replace(/\\"/g, '"')
            .replace(/\\\\/g, "\\");
    };

    let target = null;

    for (const raw of text.split("\n")) {
        const line = raw.trim();
        if (line === "" || line.startsWith("#")) {
            if (line === "")
                flush();
            continue;
        }

        if (line.startsWith("msgid_plural")) {
            if (current !== null)
                current.plural = unquote(line);
            target = "plural";
        } else if (line.startsWith("msgid")) {
            flush();
            current = { id: unquote(line), plural: null, strings: [] };
            target = "id";
        } else if (line.startsWith("msgstr")) {
            if (current !== null)
                current.strings.push(unquote(line));
            target = "str";
        } else if (line.startsWith('"') && current !== null) {
            const piece = unquote(line);
            if (target === "id")
                current.id += piece;
            else if (target === "plural")
                current.plural = (current.plural ?? "") + piece;
            else if (target === "str" && current.strings.length > 0)
                current.strings[current.strings.length - 1] += piece;
        }
    }
    flush();

    return { header, entries };
};

const pluralExpression = (header) => {
    const match = /Plural-Forms:[^\n]*plural=([^;\n]+)/i.exec(header);
    return match === null ? "(n) => n != 1" : `(n) => ${match[1].trim()}`;
};

/**
 * esbuild plugin. Emits one po.<locale>.js per catalogue found in po/.
 */
export const cockpitPoPlugin = (poDir, outDir) => ({
    name: "cockpit-po",
    setup(build) {
        build.onEnd(async (result) => {
            if (result.errors.length > 0)
                return;

            let files;
            try {
                files = (await readdir(poDir)).filter((f) => f.endsWith(".po"));
            } catch {
                // No catalogues yet is a normal state for a young project.
                return;
            }

            for (const file of files) {
                const locale = path.basename(file, ".po");
                const { header, entries } = parsePo(await readFile(path.join(poDir, file), "utf8"));
                const catalogue = { "": { language: locale, "plural-forms": pluralExpression(header) }, ...entries };
                const body =
                    `(function (root, data) {\n` +
                    `  if (typeof define === 'function' && define.amd) { define(data); }\n` +
                    `  if (typeof cockpit === 'object') { cockpit.locale(data); }\n` +
                    `}(this, ${JSON.stringify(catalogue, null, 0)}));\n`;
                await writeFile(path.join(outDir, `po.${locale}.js`), body, "utf8");
            }

            process.stdout.write(`compiled ${files.length} translation catalogue(s)\n`);
        });
    },
});
