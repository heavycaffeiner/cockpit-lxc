import cockpit from "cockpit";

import type { TerminalHandle, TerminalMode } from "../types";

/**
 * Interactive pty into a container.
 *
 * Incus's own exec endpoint upgrades to websockets for its stdin, stdout and
 * control streams, and cockpit.http speaks request/response only. Rather than
 * reimplement the Incus websocket exec protocol on a raw Cockpit channel, this
 * spawns the CLI inside a pty and streams that. It is the same mechanism
 * Cockpit's System terminal uses, so xterm integration, resize propagation and
 * binary framing all follow a path that is already known to work.
 */

/**
 * Shell selection, resolved inside the container rather than here.
 *
 * A hard-coded /bin/bash fails on minimal images with a bare "no such file",
 * which reads as a plugin bug. Falling back through the container's own
 * `command -v` keeps the failure where it belongs: an image with no shell at
 * all.
 */
const SHELL_COMMAND = "exec $(command -v bash || command -v sh || echo /bin/sh)";

const argv = (name: string, mode: TerminalMode): string[] =>
    mode === "console"
        ? ["incus", "console", name]
        : ["incus", "exec", name, "--", "/bin/sh", "-c", SHELL_COMMAND];

export const openTerminal = (name: string, mode: TerminalMode): TerminalHandle => {
    const channel = cockpit.channel({
        payload: "stream",
        spawn: argv(name, mode),
        environ: ["TERM=xterm-256color"],
        pty: true,
        // Binary framing hands xterm raw bytes, so a multi-byte character split
        // across two chunks is decoded by xterm rather than corrupted on the way.
        binary: true,
        superuser: "require",
    });

    const encoder = new TextEncoder();
    let closed = false;

    const dataHandlers: ((chunk: Uint8Array) => void)[] = [];
    const readyHandlers: ((pid: number | undefined) => void)[] = [];
    const closeHandlers: ((reason: string) => void)[] = [];

    channel.addEventListener("message", (_event, data) => {
        const bytes = typeof data === "string" ? encoder.encode(data) : data;
        for (const handler of dataHandlers)
            handler(bytes);
    });

    channel.addEventListener("ready", (_event, message) => {
        for (const handler of readyHandlers)
            handler(message.pid);
    });

    channel.addEventListener("close", (_event, options) => {
        closed = true;
        const status = options["exit-status"];
        const reason = options.problem !== undefined && options.problem !== ""
            ? options.problem
            : status !== undefined && status !== 0
                ? `exited with status ${status}`
                : "session ended";
        for (const handler of closeHandlers)
            handler(reason);
    });

    return {
        send: (data) => {
            if (closed)
                return;
            channel.send(typeof data === "string" ? encoder.encode(data) : data);
        },
        resize: (rows, cols) => {
            if (closed)
                return;
            channel.control({ command: "resize", rows, cols });
        },
        onData: (handler) => dataHandlers.push(handler),
        onReady: (handler) => readyHandlers.push(handler),
        onClose: (handler) => closeHandlers.push(handler),
        close: () => {
            if (closed)
                return;
            closed = true;
            channel.close();
        },
    };
};
