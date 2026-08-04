import cockpit from "cockpit";

import type { EventHandlers } from "../driver";
import type { LifecycleEvent } from "../types";

/**
 * Live lifecycle events, streamed from `incus monitor`.
 *
 * Incus publishes events on GET /1.0/events, which is a websocket. cockpit.http
 * speaks HTTP request/response only and cannot perform the upgrade, so rather
 * than reimplementing the Incus websocket protocol on a raw channel this spawns
 * the CLI and parses its newline-delimited JSON. The CLI is part of the same
 * package set as the daemon, so it is not an extra dependency in practice.
 */

const RECONNECT_MIN_MS = 1_000;
const RECONNECT_MAX_MS = 60_000;

/**
 * Consecutive unparseable lines tolerated before the stream is called degraded.
 *
 * One bad line is not worth alarming anyone about; a run of them means the
 * output format is not what this code expects, and a list that looks live while
 * silently ignoring every event is worse than one that admits it is stale.
 */
const PARSE_FAILURE_LIMIT = 3;

interface MonitorRecord {
    type?: string;
    timestamp?: string;
    metadata?: {
        action?: string;
        name?: string;
        source?: string;
        project?: string;
    };
}

/**
 * Instance name from a record.
 *
 * `metadata.name` carries it directly. `metadata.source` is the fallback, a URL
 * path such as "/1.0/instances/web01", for any event shape that omits the name.
 */
const instanceName = (record: MonitorRecord): string | null => {
    const name = record.metadata?.name;
    if (typeof name === "string" && name !== "")
        return name;

    const source = record.metadata?.source;
    if (typeof source !== "string")
        return null;

    const segments = source.split("?")[0]?.split("/").filter((s) => s !== "") ?? [];
    const last = segments[segments.length - 1];
    return last === undefined ? null : decodeURIComponent(last);
};

export const subscribeLifecycle = (handlers: EventHandlers): (() => void) => {
    let stopped = false;
    let process: CockpitSpawnProcess | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let backoff = RECONNECT_MIN_MS;
    let buffer = "";
    let parseFailures = 0;
    let degraded = false;

    const setDegraded = (value: boolean) => {
        if (degraded !== value) {
            degraded = value;
            handlers.onDegraded(value);
        }
    };

    const handleLine = (line: string) => {
        const trimmed = line.trim();
        // `incus monitor` separates records with blank lines.
        if (trimmed === "")
            return;

        let record: MonitorRecord;
        try {
            record = JSON.parse(trimmed) as MonitorRecord;
        } catch {
            parseFailures += 1;
            if (parseFailures >= PARSE_FAILURE_LIMIT)
                setDegraded(true);
            return;
        }

        parseFailures = 0;

        if (record.type !== "lifecycle")
            return;

        const name = instanceName(record);
        const action = record.metadata?.action;
        if (name === null || typeof action !== "string")
            return;

        handlers.onLifecycle({
            action,
            instance: name,
            timestamp: record.timestamp ?? "",
        });
    };

    const connect = () => {
        if (stopped)
            return;

        buffer = "";
        const spawned = cockpit.spawn(
            ["incus", "monitor", "--format=json", "--type=lifecycle"],
            { superuser: "require", err: "message" },
        );
        process = spawned;

        spawned.stream((chunk) => {
            // Chunks split anywhere, including mid-record, so the tail is held
            // back until a newline proves it is complete.
            buffer += chunk;
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";
            for (const line of lines)
                handleLine(line);

            // Data is flowing, so any earlier degradation is over.
            backoff = RECONNECT_MIN_MS;
            setDegraded(false);
        });

        spawned.then(
            () => scheduleRetry(),
            () => scheduleRetry(),
        );
    };

    const scheduleRetry = () => {
        if (stopped)
            return;

        // The stream ending is never normal while the page is open, so this is
        // always a degradation, whether the daemon restarted or the channel died.
        setDegraded(true);
        process = null;
        retryTimer = setTimeout(() => {
            backoff = Math.min(backoff * 2, RECONNECT_MAX_MS);
            connect();
        }, backoff);
    };

    connect();

    return () => {
        stopped = true;
        if (retryTimer !== null)
            clearTimeout(retryTimer);
        try {
            process?.close();
        } catch {
            // Already closed; nothing to release.
        }
    };
};

export type { LifecycleEvent };
