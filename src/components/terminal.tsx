import { Button, Alert } from "@patternfly/react-core";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal as XTerm } from "@xterm/xterm";
import { useCallback, useEffect, useRef, useState } from "react";

import type { ContainerDriver, TerminalHandle, TerminalMode } from "../backend";

import "@xterm/xterm/css/xterm.css";

interface TerminalPaneProps {
    driver: ContainerDriver;
    container: string;
    mode: TerminalMode;
}

/**
 * An xterm.js viewport wired to a Cockpit pty channel.
 *
 * The buffer is deliberately kept when the session ends. Output that preceded
 * an unexpected exit is usually the only evidence of why it exited, and clearing
 * it on close would throw that away exactly when it matters.
 */
export const TerminalPane = ({ driver, container, mode }: TerminalPaneProps) => {
    const hostRef = useRef<HTMLDivElement | null>(null);
    const termRef = useRef<XTerm | null>(null);
    const handleRef = useRef<TerminalHandle | null>(null);
    const [closedReason, setClosedReason] = useState<string | null>(null);
    const [generation, setGeneration] = useState(0);

    const reconnect = useCallback(() => setGeneration((n) => n + 1), []);

    useEffect(() => {
        const host = hostRef.current;
        if (host === null)
            return;

        const term = new XTerm({
            fontSize: 14,
            // 4px grid: 14px text on a 1.42857 line height lands on 20px.
            lineHeight: 1.42857,
            cursorBlink: true,
            // xterm renders to a canvas and is otherwise opaque to a screen
            // reader. This maintains a live accessibility buffer instead.
            screenReaderMode: true,
            scrollback: 5000,
            allowProposedApi: true,
        });
        const fit = new FitAddon();
        term.loadAddon(fit);
        term.open(host);
        termRef.current = term;

        setClosedReason(null);

        const handle = driver.openTerminal(container, mode);
        handleRef.current = handle;

        handle.onData((chunk) => term.write(chunk));
        handle.onClose((reason) => {
            setClosedReason(reason);
            // Dim, so it reads as annotation rather than as program output.
            term.write(`\r\n\x1b[2m[${reason}]\x1b[0m\r\n`);
        });

        const disposable = term.onData((data) => handle.send(data));

        const applyFit = () => {
            try {
                fit.fit();
            } catch {
                // Fitting throws while the element is detached or zero-sized,
                // which happens during tab transitions and is not a fault.
                return;
            }
            handle.resize(term.rows, term.cols);
        };

        // The pty must be told the size, not just xterm: a shell that thinks the
        // window is 80x24 will wrap its output there whatever the browser shows.
        const observer = new ResizeObserver(applyFit);
        observer.observe(host);
        applyFit();
        term.focus();

        return () => {
            observer.disconnect();
            disposable.dispose();
            handle.close();
            term.dispose();
            termRef.current = null;
            handleRef.current = null;
        };
    }, [driver, container, mode, generation]);

    return (
        <div className="lxc-terminal">
            <p className="lxc-terminal__hint" id={`lxc-term-hint-${mode}`}>
                Keystrokes go to the container. Press <kbd>Ctrl</kbd> + <kbd>Shift</kbd> +{" "}
                <kbd>Tab</kbd> to move focus out of the terminal.
            </p>

            {mode === "console" && (
                <Alert
                    variant="info"
                    isInline
                    isPlain
                    title="Incus allows one console attachment at a time, so opening this may take the console away from another session."
                />
            )}

            {closedReason !== null && (
                <Alert
                    variant="warning"
                    isInline
                    title={`Session ended: ${closedReason}`}
                    className="lxc-terminal__closed"
                >
                    <Button variant="link" isInline onClick={reconnect}>
                        Reconnect
                    </Button>
                </Alert>
            )}

            <div
                className="lxc-terminal__viewport"
                ref={hostRef}
                role="application"
                aria-label={`${mode === "console" ? "Console" : "Shell"} for ${container}`}
                aria-describedby={`lxc-term-hint-${mode}`}
            />
        </div>
    );
};
