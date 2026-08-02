#!/usr/bin/env node
/**
 * esbuild driver for cockpit-lxc.
 *
 * Output goes to dist/, which is what `make install` copies into
 * /usr/share/cockpit/lxc and what `make devinstall` symlinks into
 * ~/.local/share/cockpit/lxc.
 *
 * Cockpit's client library is loaded by index.html as a classic script, which
 * sets window.cockpit. The bare "cockpit" specifier is aliased to the shim in
 * src/backend that re-exports that global. Bundling base1/cockpit.js instead
 * would duplicate what the server already serves and pin the plugin to a copy
 * that can drift from the running Cockpit.
 *
 * Output format is iife, matching Cockpit's own pages. An ES module would also
 * work, but iife keeps the loading model identical to every other package on
 * the system and avoids depending on module/classic ordering rules.
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
    format: "iife",
    target: ["es2020"],
    platform: "browser",
    sourcemap: production ? false : "linked",
    minify: production,
    legalComments: "external",
    alias: {
        cockpit: path.join(srcDir, "backend", "cockpit-runtime.ts"),
    },
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
