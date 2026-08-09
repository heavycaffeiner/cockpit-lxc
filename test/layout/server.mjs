/**
 * The static origin the harness page is served from.
 *
 * dist/ is served at the root so the bundle sees the same relative paths it
 * would inside Cockpit, and the harness's own two scripts are served under
 * /_harness/ so they cannot collide with anything the build produces.
 *
 * node:http rather than a dependency. This serves four kinds of file to one
 * client on localhost.
 */
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(path.dirname(path.dirname(here)), "dist");
const hostDir = path.join(here, "host");
const builtDir = path.join(here, ".host");

const TYPES = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".ttf": "font/ttf",
    ".svg": "image/svg+xml",
    ".png": "image/png",
};

/**
 * Resolve a URL path to a file, refusing anything that escapes its root.
 *
 * The client here is a browser this process launched, so traversal is not a
 * threat model so much as a way to get a confusing error. It is still cheaper to
 * refuse than to explain.
 */
const resolve = (urlPath) => {
    const clean = decodeURIComponent(urlPath.split("?")[0]);

    if (clean.startsWith("/_harness/")) {
        const name = clean.slice("/_harness/".length);
        const root = name.endsWith(".html") ? hostDir : builtDir;
        const file = path.join(root, name);
        return file.startsWith(root) ? file : null;
    }

    const file = path.join(distDir, clean === "/" ? "index.html" : clean);
    return file.startsWith(distDir) ? file : null;
};

export const startServer = async () => {
    const server = createServer((request, response) => {
        const file = resolve(request.url ?? "/");
        if (file === null) {
            response.writeHead(403).end("refused");
            return;
        }

        stat(file).then((info) => {
            if (!info.isFile())
                throw new Error("not a file");
            response.writeHead(200, {
                "content-type": TYPES[path.extname(file)] ?? "application/octet-stream",
                // The bundle is rebuilt between runs and the harness must never
                // measure a stale one.
                "cache-control": "no-store",
            });
            createReadStream(file).pipe(response);
        }).catch(() => {
            response.writeHead(404, { "content-type": "text/plain" })
                .end(`cockpit-lxc layout harness: ${request.url} is not in dist/ or test/layout/. ` +
                     "Run `npm run build && npm run build:harness` first.");
        });
    });

    await new Promise((done) => server.listen(0, "127.0.0.1", done));
    const { port } = server.address();

    return {
        origin: `http://127.0.0.1:${port}`,
        close: () => new Promise((done) => server.close(done)),
    };
};
