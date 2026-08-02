#!/usr/bin/env node
/**
 * esbuild driver for cockpit-lxc.
 *
 * Output goes to dist/, which is what `make install` copies into
 * /usr/share/cockpit/lxc and what `make devinstall` symlinks into
 * ~/.local/share/cockpit/lxc.
 *
 * The `cockpit` module is marked external and resolved in the browser by the
 * import map in src/index.html, which points at ../base1/cockpit.js. Cockpit
 * serves that itself, so bundling it would both duplicate it and pin us to a
 * copy that can drift from the running server.
 */
import { context } from "esbuild";
import { sassPlugin } from "esbuild-sass-plugin";
import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(rootDir, "dist");
const srcDir = path.join(rootDir, "src");

const watch = process.argv.includes("--watch");
const production = process.env.NODE_ENV === "production" || !watch;

/** Copies the files esbuild does not process itself. */
const copyAssetsPlugin = {
    name: "copy-assets",
    setup(build) {
        build.onEnd(async (result) => {
            if (result.errors.length > 0)
                return;
            for (const file of ["manifest.json", "index.html"])
                await cp(path.join(srcDir, file), path.join(outDir, file));
        });
    },
};

/** Reports build completion, so `--watch` gives some sign of life. */
const notifyPlugin = {
    name: "notify-end",
    setup(build) {
        build.onEnd((result) => {
            const stamp = new Date().toTimeString().slice(0, 8);
            if (result.errors.length > 0)
                process.stderr.write(`[${stamp}] build failed\n`);
            else
                process.stdout.write(`[${stamp}] build ok -> ${path.relative(rootDir, outDir)}\n`);
        });
    },
};

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

const ctx = await context({
    entryPoints: [path.join(srcDir, "index.tsx")],
    outdir: outDir,
    bundle: true,
    format: "esm",
    target: ["es2020"],
    platform: "browser",
    sourcemap: production ? false : "linked",
    minify: production,
    legalComments: "external",
    external: ["cockpit"],
    loader: {
        ".woff": "file",
        ".woff2": "file",
        ".ttf": "file",
        ".svg": "file",
        ".png": "file",
    },
    define: {
        "process.env.NODE_ENV": JSON.stringify(production ? "production" : "development"),
    },
    plugins: [sassPlugin({ loadPaths: ["node_modules"] }), copyAssetsPlugin, notifyPlugin],
});

if (watch) {
    await ctx.watch();
    process.stdout.write("watching for changes, Ctrl+C to stop\n");
} else {
    await ctx.rebuild();
    await ctx.dispose();
}
