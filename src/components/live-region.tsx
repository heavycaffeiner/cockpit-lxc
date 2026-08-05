import { useEffect, useState } from "react";

/**
 * Announcements for operations that finish somewhere other than where they
 * started.
 *
 * Starting a container updates a label in a table row and nothing else. Sighted
 * operators see the row change; a screen reader user gets silence, because
 * neither focus nor the document title moved. This is the region that says what
 * happened.
 *
 * A module-level subscription rather than a context, because the announcement
 * has nothing to do with the tree: the caller is a row action or a dialog deep
 * in it, and threading a callback down to every one of them would be plumbing
 * that carries no information.
 */
const listeners = new Set<(message: string) => void>();

export const announce = (message: string): void => {
    for (const listener of listeners)
        listener(message);
};

export const LiveRegion = () => {
    const [message, setMessage] = useState("");

    useEffect(() => {
        /*
         * The message is cleared before the next one is set. A screen reader
         * ignores a re-render whose text is unchanged, so two identical
         * announcements in a row would be read once, and "web01 started" said
         * twice means it started twice.
         */
        const listener = (next: string) => {
            setMessage("");
            requestAnimationFrame(() => setMessage(next));
        };
        listeners.add(listener);
        return () => { listeners.delete(listener); };
    }, []);

    return (
        <div aria-live="polite" aria-atomic="true" className="pf-v6-screen-reader">
            {message}
        </div>
    );
};
