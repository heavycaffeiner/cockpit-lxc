/**
 * Generate the English catalogue as a module, so it is bundled rather than
 * fetched, together with the key object the runtime hangs its accessors off.
 *
 * Cockpit serves exactly one translation file per package, `po.js`, resolved
 * from the request's Accept-Language. `po.<locale>.js` is not fetchable by name
 * even for Cockpit's own packages, and a session whose language has no
 * catalogue gets an empty `po.js` rather than a fallback. English therefore
 * cannot be loaded over the network the way the other languages are; bundling
 * it is what makes the fallback layer exist at all.
 *
 * `K` is the key tree: `K.list.name` is the string "list.name". Call sites do
 * not use it directly, they use the `T` accessor built from it in
 * src/backend/i18n.ts, but everything about which keys exist is decided here so
 * that a mistyped one is a compile error rather than a key rendered into the UI.
 *
 * `PluralKey` names the entries that carry plural forms, which is what lets `T`
 * expose those as `T.snapshots.day_ago(n)` and the rest as plain strings.
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
const pluralKeys = keys.filter((key) => Array.isArray(entries[key]));

/*
 * Every segment has to be a plain identifier, because the whole point of the
 * key tree is dot access. A key like `fields.4_or_0_3` would only be reachable
 * through brackets, which is exactly the string-spelling this replaces, so it
 * fails the build instead of quietly producing one property nobody can address.
 */
const invalid = keys.filter((k) => k.split(".").some((s) => !/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(s)));
if (invalid.length > 0) {
    process.stderr.write(
        `po/en.po has ${invalid.length} key(s) that are not reachable as T.a.b:\n` +
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

const union = (values) =>
    values.length === 0 ? "    never" : values.map((v) => `    | ${JSON.stringify(v)}`).join("\n");

await mkdir(outDir, { recursive: true });
await writeFile(outFile,
    "/* Generated from po/en.po by build/gen-en.mjs. Do not edit. */\n\n" +
    "/** Every message id in the catalogue. */\n" +
    `export type MessageKey =\n${union(keys)};\n\n` +
    "/** The ids that carry plural forms, which `T` exposes as functions of a count. */\n" +
    `export type PluralKey =\n${union(pluralKeys)};\n\n` +
    `export const PLURAL_KEYS: ReadonlySet<string> = new Set(${JSON.stringify(pluralKeys)});\n\n` +
    "/** The key tree the `T` accessor is built from. */\n" +
    `export const K = ${render(tree, 0)} as const;\n\n` +
    `export const EN_CATALOGUE: Record<MessageKey, string | string[]> = ${JSON.stringify(entries, null, 4)};\n\n` +
    `export const EN_PLURAL: (n: number) => number = ${pluralExpression(header)};\n`,
    "utf8");

process.stdout.write(
    `generated ${path.relative(root, outFile)} with ${keys.length} keys ` +
    `(${pluralKeys.length} plural)\n`,
);
