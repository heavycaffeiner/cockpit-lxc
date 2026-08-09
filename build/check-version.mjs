/**
 * One version, declared in five places, checked to be the same one.
 *
 * package.json drives the build, the Makefile names the tarball, and one file
 * per supported distribution names its package: the rpm spec for RHEL, the
 * debian changelog for Debian, the PKGBUILD for Arch. Nothing makes them agree,
 * and a package whose name says 0.1.0 while its contents are 0.2.0 is worse
 * than a build that failed: it installs, and it lies.
 *
 * The release workflow additionally checks the git tag against package.json, so
 * between the two every name a user can see comes from the same number.
 *
 * The layout audit's browser image is checked here too, for the same reason and
 * against a different failure: a runner built against one Playwright API driving
 * browsers from another breaks in ways that read as layout defects.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (...parts) => readFile(path.join(root, ...parts), "utf8");

const first = (text, pattern, what) => {
    const match = pattern.exec(text);
    if (match === null) {
        process.stderr.write(`could not find the version in ${what}\n`);
        process.exit(1);
    }
    return match[1];
};

const declared = {
    "package.json": JSON.parse(await read("package.json")).version,
    "Makefile": first(await read("Makefile"), /^VERSION\s*:=\s*(\S+)/m, "Makefile"),
    "packaging/cockpit-lxc.spec": first(
        await read("packaging", "cockpit-lxc.spec"),
        /^Version:\s*(\S+)/m,
        "the rpm spec",
    ),
    // The changelog carries a Debian revision, "0.1.0-1"; only the upstream
    // half of it is this project's version.
    "packaging/debian/changelog": first(
        await read("packaging", "debian", "changelog"),
        /^cockpit-lxc \(([^)-]+)(?:-[^)]+)?\)/m,
        "the debian changelog",
    ),
    "packaging/arch/PKGBUILD": first(
        await read("packaging", "arch", "PKGBUILD"),
        /^pkgver=(\S+)/m,
        "the PKGBUILD",
    ),
};

const versions = new Set(Object.values(declared));
if (versions.size !== 1) {
    process.stderr.write("the declared versions disagree:\n");
    for (const [file, version] of Object.entries(declared))
        process.stderr.write(`  ${version.padEnd(12)} ${file}\n`);
    process.exit(1);
}

process.stdout.write(`version ${[...versions][0]}, agreed by all ${Object.keys(declared).length} files\n`);

/*
 * The audit environment. Three claims, checked against each other:
 *
 * the npm package and the image tag are the same Playwright release; the tag is
 * spelled the way the registry spells it; and the workflow, which cannot read a
 * JSON file to build its `container.image`, repeats the same reference the
 * Makefile derives from image.json.
 */
const playwright = JSON.parse(await read("package.json")).devDependencies["@playwright/test"];
const image = JSON.parse(await read("test", "layout", "image.json"));
const workflow = await read(".github", "workflows", "check.yml");

const reference = `${image.image}@${image.digest}`;
const mismatches = [];

if (image.version !== playwright)
    mismatches.push(`@playwright/test is ${playwright}, test/layout/image.json says ${image.version}`);

if (image.image !== `mcr.microsoft.com/playwright:v${image.version}-noble`)
    mismatches.push(`the image tag "${image.image}" does not name version ${image.version}`);

if (!image.digest.startsWith("sha256:"))
    mismatches.push("the image digest is missing, so a run cannot be reproduced");
else if (!workflow.includes(reference))
    mismatches.push(`.github/workflows/check.yml does not use "${reference}"`);

if (mismatches.length > 0) {
    process.stderr.write("the layout audit environment is inconsistent:\n");
    for (const mismatch of mismatches)
        process.stderr.write(`  ${mismatch}\n`);
    process.exit(1);
}

process.stdout.write(`layout audit runs on ${reference}\n`);
