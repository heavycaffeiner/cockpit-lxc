import cockpit from "cockpit";

import { DriverError } from "../errors";
import type { Remote, RemoteImage } from "../types";

/**
 * Remotes, read from the CLI.
 *
 * Remotes are the one part of Incus that has no REST endpoint: the daemon does
 * not know them, the client does. `incus remote list` is therefore not a
 * shortcut around the API, it is the only source. The CLI is already a
 * dependency for the terminal and the event stream, so this adds no new one.
 *
 * Both commands are invoked with a fixed argument list rather than a shell
 * string, so a remote name can never be read as shell syntax.
 */

/** Cockpit type-checks argv, and a cross-realm array fails that check. */
const run = async (argv: readonly string[]): Promise<string> => {
    try {
        return await cockpit.spawn([...argv], { superuser: "require", err: "message" });
    } catch (reason) {
        const message = reason instanceof Error ? reason.message : String(reason);
        throw new DriverError("transport", `${argv[0] ?? "incus"} failed: ${message}`);
    }
};

const parseJson = (text: string, what: string): unknown => {
    try {
        return JSON.parse(text);
    } catch {
        throw new DriverError("parse", `The incus CLI returned unparseable ${what}`);
    }
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
    typeof value === "object" && value !== null && !Array.isArray(value)
        ? value as Record<string, unknown>
        : null;

const asString = (value: unknown): string => (typeof value === "string" ? value : "");

/**
 * `incus remote list --format=json` answers with an object keyed by name, not
 * with a list.
 */
export const listRemotes = async (): Promise<Remote[]> => {
    const parsed = asRecord(parseJson(await run(["incus", "remote", "list", "--format=json"]), "remotes"));
    if (parsed === null)
        throw new DriverError("parse", "The incus CLI returned no usable remote list");

    return Object.entries(parsed)
        .map(([name, value]) => {
            const record = asRecord(value);
            const address = asString(record?.["Addr"]);
            return {
                name,
                address,
                protocol: asString(record?.["Protocol"]),
                // "local" talks to this host's own socket, so it holds the
                // images already pulled rather than a catalogue to pull from.
                isLocal: address === "" || address.startsWith("unix:"),
            };
        })
        .sort((a, b) => a.name.localeCompare(b.name));
};

interface WireRemoteImage {
    aliases?: { name?: string }[];
    fingerprint?: string;
    properties?: Record<string, string>;
    architecture?: string;
    size?: number;
    type?: string;
}

/**
 * A remote's catalogue.
 *
 * Only aliased images are listed. An image with no alias can only be named by
 * its fingerprint, which is not something an operator picks from a list, and
 * every image on a public server has one.
 */
export const listRemoteImages = async (remote: string): Promise<RemoteImage[]> => {
    const parsed = parseJson(
        await run(["incus", "image", "list", `${remote}:`, "--format=json"]),
        "images",
    );
    if (!Array.isArray(parsed))
        throw new DriverError("parse", `The incus CLI returned no usable image list for ${remote}`);

    const images: RemoteImage[] = [];
    for (const entry of parsed as WireRemoteImage[]) {
        const alias = entry.aliases?.find((a) => typeof a?.name === "string" && a.name !== "")?.name;
        if (alias === undefined)
            continue;
        images.push({
            alias,
            description: asString(entry.properties?.["description"]),
            architecture: asString(entry.architecture),
            size: typeof entry.size === "number" ? entry.size : 0,
            type: asString(entry.type) === "" ? "container" : asString(entry.type),
        });
    }

    return images.sort((a, b) => a.alias.localeCompare(b.alias));
};
