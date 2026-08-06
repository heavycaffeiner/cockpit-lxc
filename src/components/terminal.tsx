import {
    Alert,
    Button,
    FormSelect,
    FormSelectOption,
} from "@patternfly/react-core";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal as XTerm } from "@xterm/xterm";
import { useCallback, useEffect, useRef, useState } from "react";

import {
    T,
    format,
    type ContainerDriver,
    type TerminalHandle,
    type TerminalMode,
} from "../backend";

import "@xterm/xterm/css/xterm.css";

/**
 * Font sizes offered, in whole 4px line-height steps.
 *
 * The viewport is `rows * cellHeight`, so a font whose line height is not a
 * multiple of 4 puts everything below the terminal off the grid. Each size here
 * is paired with the ratio that lands its line height on one.
 */
const FONT_SIZES: readonly { size: number; lineHeight: number }[] = [
    { size: 12, lineHeight: 1.3333 },   // 16px
    { size: 14, lineHeight: 1.42857 },  // 20px
    { size: 16, lineHeight: 1.5 },      // 24px
    { size: 18, lineHeight: 1.5556 },   // 28px
];

const DEFAULT_FONT = FONT_SIZES[1] as { size: number; lineHeight: number };

const fontFor = (size: number) => FONT_SIZES.find((entry) => entry.size === size) ?? DEFAULT_FONT;

interface TerminalPaneProps {
    driver: ContainerDriver;
    container: string;
    mode: TerminalMode;
    fontSize: number;
    onFontSizeChange: (size: number) => void;
}

/**
 * An xterm.js viewport wired to a Cockpit pty channel.
 *
 * The buffer is deliberately kept when the session ends. Output that preceded
 * an unexpected exit is usually the only evidence of why it exited, and clearing
 * it on close would throw that away exactly when it matters.
 */
export const TerminalPane = ({
    driver,
    container,
    mode,
    fontSize,
    onFontSizeChange,
}: TerminalPaneProps) => {
    const hostRef = useRef<HTMLDivElement | null>(null);
    const termRef = useRef<XTerm | null>(null);
    const handleRef = useRef<TerminalHandle | null>(null);
    const [closedReason, setClosedReason] = useState<string | null>(null);
    const [generation, setGeneration] = useState(0);

    const reconnect = useCallback(() => setGeneration((n) => n + 1), []);
    const font = fontFor(fontSize);

    useEffect(() => {
        const host = hostRef.current;
        if (host === null)
            return;

        const term = new XTerm({
            fontSize: font.size,
            lineHeight: font.lineHeight,
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
    }, [driver, container, mode, generation, font.size, font.lineHeight]);

    return (
        <div className="lxc-terminal">
            <div className="lxc-terminal__bar">
                <p className="lxc-terminal__hint" id={`lxc-term-hint-${mode}`}>
                    {T.terminal.keystrokes_go_to_the_container_press}
                </p>
                <div className="lxc-terminal__font">
                    <FormSelect
                        id={`lxc-term-font-${mode}`}
                        value={String(font.size)}
                        onChange={(_event, value) => onFontSizeChange(Number(value))}
                        aria-label={T.terminal.terminal_font_size}
                    >
                        {FONT_SIZES.map((entry) => (
                            <FormSelectOption
                                key={entry.size}
                                value={String(entry.size)}
                                label={format(T.terminal.px, entry.size)}
                            />
                        ))}
                    </FormSelect>
                </div>
            </div>

            {mode === "console" && (
                <Alert
                    variant="info"
                    isInline
                    isPlain
                    title={T.terminal.incus_allows_one_console_attachment_at}
                />
            )}

            {closedReason !== null && (
                <Alert
                    variant="warning"
                    isInline
                    title={format(T.terminal.session_ended, closedReason)}
                    className="lxc-terminal__closed"
                >
                    <Button variant="link" isInline onClick={reconnect}>
                        {T.terminal.reconnect}
                    </Button>
                </Alert>
            )}

            <div
                className="lxc-terminal__viewport"
                ref={hostRef}
                role="application"
                aria-label={format(mode === "console" ? T.terminal.console_for : T.terminal.shell_for, container)}
                aria-describedby={`lxc-term-hint-${mode}`}
            />
        </div>
    );
};
