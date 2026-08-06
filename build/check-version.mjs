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
