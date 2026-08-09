/**
 * Load the recorded fixtures and compose one bundle per scenario.
 *
 * The bundle is handed to the page whole, through addInitScript, rather than
 * being fetched from a server the shim would have to call. That keeps the shim
 * synchronous at install time and removes an ordering hazard: nothing the plugin
 * does can race a fixture that has not arrived yet.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(here, "fixtures");

const readJson = async (file) => JSON.parse(await readFile(path.join(fixturesDir, file), "utf8"));

/**
 * Resolve the body filenames in index.json into their contents.
 *
 * A body is inlined as text rather than as parsed JSON, because that is what
 * cockpit.http hands back and what src/backend/incus/envelope.ts parses. Handing
 * over an object would skip the parse that production performs.
 */
export const loadBase = async () => {
    const index = await readJson("index.json");
    const bodies = new Map();

    const bodyOf = async (file) => {
        if (!bodies.has(file))
            bodies.set(file, await readFile(path.join(fixturesDir, file), "utf8"));
        return bodies.get(file);
    };

    const responses = {};
    for (const [key, entry] of Object.entries(index.responses)) {
        responses[key] = {
            status: entry.status,
            body: await bodyOf(entry.body),
            ...(entry.headers === undefined ? {} : { headers: entry.headers }),
        };
    }

    const processes = {};
    for (const [key, entry] of Object.entries(index.processes)) {
        processes[key] = entry.hang === true
            ? { hang: true }
            : { output: await bodyOf(entry.output) };
    }

    return {
        responses,
        processes,
        permission: index.permission,
        terminal: index.terminal,
    };
};

/**
 * Apply a scenario's overrides to the base bundle.
 *
 * `responses` and `processes` are merged key by key, so an override names only
 * the endpoint it changes. `body` in an override is either a fixture filename or
 * a literal string; a name that resolves to a file wins, which is why the
 * distinction is made by trying the file rather than by a flag.
 */
export const applyOverrides = async (base, overrides = {}) => {
    const bundle = {
        responses: { ...base.responses },
        processes: { ...base.processes },
        permission: { ...base.permission },
        terminal: [...base.terminal],
    };

    for (const [key, entry] of Object.entries(overrides.responses ?? {})) {
        bundle.responses[key] = {
            status: entry.status ?? 200,
            body: entry.file === undefined ? entry.body ?? "" : await readFile(path.join(fixturesDir, entry.file), "utf8"),
            ...(entry.headers === undefined ? {} : { headers: entry.headers }),
        };
    }

    for (const [key, entry] of Object.entries(overrides.processes ?? {}))
        bundle.processes[key] = entry;

    if (overrides.permission !== undefined)
        bundle.permission = overrides.permission;

    if (overrides.transportProblem !== undefined)
        bundle.transportProblem = overrides.transportProblem;

    return bundle;
};
