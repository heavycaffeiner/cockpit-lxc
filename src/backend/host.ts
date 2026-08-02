import cockpit from "cockpit";

/**
 * The host this Cockpit session is connected to.
 *
 * This exists so that Phase 1 exercises the whole loading path end to end:
 * the classic <script> that publishes window.cockpit, the esbuild alias that
 * points the bare "cockpit" specifier at the shim, and the rule that the UI
 * reaches Cockpit only through this boundary. Without a real call site the
 * wiring would be bundled away and stay unverified until Phase 2.
 */
export const getHostName = (): string => cockpit.transport.host;
