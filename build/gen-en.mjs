/**
 * Generate the English catalogue as a module, so it is bundled rather than
 * fetched, together with the key object call sites address it through.
 *
 * Cockpit serves exactly one translation file per package, `po.js`, resolved
 * from the request's Accept-Language. `po.<locale>.js` is not fetchable by name
 * even for Cockpit's own packages, and a session whose language has no
 * catalogue gets an empty `po.js` rather than a fallback. English therefore
 * cannot be loaded over the network the way the other languages are; bundling
 * it is what makes the fallback layer exist at all.
 *
 * The `K` object is the second half of that. Keys are addressed as `K.list.name`
 * rather than as the string "list.name", so a mistyped key is a compile error at
 * the call site instead of a key showing through in the UI, and an editor can
 * complete and rename them. `MessageKey` narrows `_()` to the keys that exist,
 * which closes the same hole for anyone who writes the string out by hand.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parsePo, pluralExpression } from "./po-parse.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const source = path.join(root, "po", "en.po");
const outDir = path.join(root, "src", "generated");
const outFile = path.join(outDir, "catalogue-en.ts");

const { header, entries } = parsePo(await readFile(source, "utf8"));

const keys = Object.keys(entries).sort();

/*
 * Every segment has to be a plain identifier, because the whole point of K is
 * dot access. A key like `fields.4_or_0_3` would only be reachable through
 * brackets, which is exactly the string-spelling this replaces, so it fails the
 * build instead of quietly producing one property nobody can address.
 */
const invalid = keys.filter((k) => k.split(".").some((s) => !/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(s)));
if (invalid.length > 0) {
    process.stderr.write(
        `po/en.po has ${invalid.length} key(s) that are not reachable as K.a.b:\n` +
        invalid.map((k) => `  ${k}\n`).join(""),
    );
    process.exit(1);
}

/** Nest "a.b.c" into { a: { b: { c: "a.b.c" } } }, at whatever depth keys use. */
const tree = {};
for (const key of keys) {
    const segments = key.split(".");
    const leaf = segments.pop();
    let node = tree;
    for (const segment of segments) {
        node[segment] ??= {};
        node = node[segment];
    }
    node[leaf] = key;
}

const render = (node, indent) => {
    const pad = " ".repeat(indent + 4);
    const body = Object.entries(node)
        .map(([name, value]) => `${pad}${name}: ` +
            (typeof value === "string" ? JSON.stringify(value) : render(value, indent + 4)))
        .join(",\n");
    return `{\n${body},\n${" ".repeat(indent)}}`;
};

await mkdir(outDir, { recursive: true });
await writeFile(outFile,
    "/* Generated from po/en.po by build/gen-en.mjs. Do not edit. */\n\n" +
    "/** Every message id in the catalogue. `_()` accepts nothing else. */\n" +
    `export type MessageKey =\n${keys.map((k) => `    | ${JSON.stringify(k)}`).join("\n")};\n\n` +
    "/**\n" +
    " * The keys, addressed as properties: `_(K.list.name)`.\n" +
    " *\n" +
    " * Call sites never spell a key out, so a typo does not compile and renaming\n" +
    " * one is a rename rather than a search.\n" +
    " */\n" +
    `export const K = ${render(tree, 0)} as const;\n\n` +
    `export const EN_CATALOGUE: Record<MessageKey, string | string[]> = ${JSON.stringify(entries, null, 4)};\n\n` +
    `export const EN_PLURAL: (n: number) => number = ${pluralExpression(header)};\n`,
    "utf8");

process.stdout.write(`generated ${path.relative(root, outFile)} with ${keys.length} keys\n`);
