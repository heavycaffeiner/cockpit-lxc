import {
    Alert,
    Button,
    FormSelect,
    FormSelectOption,
    Spinner,
} from "@patternfly/react-core";
import { SyncAltIcon } from "@patternfly/react-icons";
import { useEffect, useState } from "react";

import { T, format, type ContainerDriver, type LogFile } from "../backend";

/**
 * How much of a log file is rendered.
 *
 * A console log grows for as long as the container runs, and putting megabytes
 * of it into the DOM freezes the page to show the part nobody asked about. The
 * end is what a log is read for.
 */
const TAIL_LINES = 2000;

const errorText = (error: unknown): string =>
    error instanceof Error ? error.message : String(error);

interface LogsTabProps {
    driver: ContainerDriver;
    container: string;
}

export const LogsTab = ({ driver, container }: LogsTabProps) => {
    const [files, setFiles] = useState<LogFile[] | null>(null);
    const [selected, setSelected] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    /** Bumped by Refresh, so a re-read of the same file still re-runs. */
    const [generation, setGeneration] = useState(0);

    /*
     * The fetched text is stored with what it was fetched for. Clearing it when
     * the selection changes would mean writing state from inside an effect,
     * which costs an extra render pass; comparing instead makes "still loading"
     * something derived rather than something stored.
     */
    const [loaded, setLoaded] = useState<{ token: string; text: string } | null>(null);
    const token = `${selected ?? ""}#${generation}`;
    const contents = loaded?.token === token ? loaded.text : null;

    useEffect(() => {
        let cancelled = false;
        driver.listLogs(container).then(
            (result) => {
                if (cancelled)
                    return;
                setFiles(result);
                setError(null);
                // Only when nothing is chosen: reselecting on every refresh
                // would pull the operator off the file they were reading.
                setSelected((current) => current ?? result[0]?.name ?? null);
            },
            (caught: unknown) => {
                if (cancelled)
                    return;
                setFiles([]);
                setError(errorText(caught));
            },
        );
        return () => { cancelled = true; };
    }, [driver, container, generation]);

    useEffect(() => {
        if (selected === null)
            return;
        let cancelled = false;
        driver.readLog(container, selected, TAIL_LINES).then(
            (text) => {
                if (!cancelled) {
                    setLoaded({ token, text });
                    setError(null);
                }
            },
            (caught: unknown) => {
                if (!cancelled) {
                    setLoaded({ token, text: "" });
                    setError(errorText(caught));
                }
            },
        );
        return () => { cancelled = true; };
    }, [driver, container, selected, token]);

    if (files === null)
        return <Spinner aria-label={T.logs.loading_logs} />;

    return (
        <div className="lxc-logs">
            {error !== null && <Alert variant="danger" isInline title={error} />}

            {files.length === 0
                ? <p className="lxc-muted">{T.logs.this_container_has_no_log_files}</p>
                : (
                    <>
                        <div className="lxc-page__toolbar">
                            <div className="lxc-logs__picker">
                                <FormSelect
                                    id="lxc-log-file"
                                    value={selected ?? ""}
                                    onChange={(_event, value) => setSelected(value)}
                                    aria-label={T.logs.log_file}
                                >
                                    {files.map((file) => (
                                        <FormSelectOption key={file.name} value={file.name}
                                            label={file.name} />
                                    ))}
                                </FormSelect>
                            </div>
                            <Button variant="secondary" icon={<SyncAltIcon />}
                                onClick={() => setGeneration((n) => n + 1)}>
                                {T.common.refresh}
                            </Button>
                        </div>

                        <p className="lxc-muted lxc-logs__note">
                            {format(T.logs.showing_the_last_lines, TAIL_LINES)}
                        </p>

                        {contents === null
                            ? <Spinner aria-label={T.logs.loading_the_log} />
                            : contents.trim() === ""
                                ? <p className="lxc-muted">{T.logs.this_file_is_empty}</p>
                                : (
                                    /*
                                     * A labelled, focusable region rather than a
                                     * bare <pre>: the log scrolls, and a scroll
                                     * container that cannot take focus is
                                     * unreachable from the keyboard.
                                     */
                                    <pre
                                        className="lxc-logs__body"
                                        tabIndex={0}
                                        role="region"
                                        aria-label={format(T.logs.contents_of, selected ?? "")}
                                    >
                                        {contents}
                                    </pre>
                                )}
                    </>
                )}
        </div>
    );
};
