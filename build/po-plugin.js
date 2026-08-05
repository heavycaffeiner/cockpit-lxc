/**
 * Compile .po catalogues into the one file Cockpit will serve.
 *
 * The catalogues are key-based: msgid is a stable identifier such as
 * `list.create_container`, and every language supplies its text through
 * msgstr. Nothing here assumes a source language.
 *
 * English is deliberately not emitted. Cockpit serves exactly one translation
 * file per package, `po.js`, resolved from the request's Accept-Language;
 * `po.<locale>.js` returns 404 by name even for Cockpit's own packages. English
 * is therefore bundled by build/gen-en.mjs instead, which is what gives the
 * runtime a fallback layer at all.
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { parsePo, pluralExpression } from "./po-parse.mjs";

export const cockpitPoPlugin = (poDir, outDir) => ({
    name: "cockpit-lxc-po",
    setup(build) {
        build.onEnd(async (result) => {
            if (result.errors.length > 0)
                return;

            let files;
            try {
                files = (await readdir(poDir))
                    .filter((f) => f.endsWith(".po") && f !== "en.po");
            } catch {
                return;
            }

            const summary = [];
            for (const file of files) {
                const locale = path.basename(file, ".po");
                const { header, entries } = parsePo(
                    await readFile(path.join(poDir, file), "utf8"),
                );

                const body =
                    "(function (w) {\n" +
                    "  var r = w.cockpitLxcI18n = w.cockpitLxcI18n || { catalogues: {}, plurals: {} };\n" +
                    `  r.catalogues[${JSON.stringify(locale)}] = ${JSON.stringify(entries)};\n` +
                    `  r.plurals[${JSON.stringify(locale)}] = ${pluralExpression(header)};\n` +
                    "}(window));\n";

                await writeFile(path.join(outDir, `po.${locale}.js`), body, "utf8");
                summary.push(`${locale} (${Object.keys(entries).length})`);
            }

            process.stdout.write(
                `catalogues: ${summary.join(", ") || "none"}; English is bundled\n`,
            );
        });
    },
});
