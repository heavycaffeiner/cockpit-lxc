#!/usr/bin/env node
/**
 * Bundle the two page-side pieces of the harness.
 *
 * The shim and the probe are TypeScript because both are checked against
 * declarations that matter: the shim against src/types/cockpit.d.ts, so a method
 * the plugin starts calling fails to compile until the shim answers it, and the
 * probe against lib.dom, so a mistyped computed-style property is a build error
 * rather than a silent zero in every measurement.
 *
 * iife, matching how src/index.html loads base1/cockpit.js. Both files run as
 * classic scripts before the deferred plugin bundle.
 */
import { build } from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(here, ".host");

await build({
    entryPoints: [
        path.join(here, "host", "fake-cockpit.ts"),
        path.join(here, "host", "probe.ts"),
    ],
    outdir: outDir,
    bundle: true,
    format: "iife",
    target: ["es2020"],
    platform: "browser",
    // Not minified. A harness failure is read in the browser's console by a
    // human, and there is nothing here worth shortening.
    minify: false,
    sourcemap: false,
});

process.stdout.write(`built harness scripts -> ${path.relative(process.cwd(), outDir)}\n`);
