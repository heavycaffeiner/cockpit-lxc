import cockpit from "cockpit";

/**
 * Reload the page when Cockpit's administrative access changes.
 *
 * The startup sequence branches on whether the session can reach the Incus
 * socket, so escalating privilege has to re-run it. Cockpit already knows when
 * that happens; without this the operator would grant access and then sit
 * looking at the same "administrative access required" screen.
 */
export const reloadOnSuperuserChange = (): void => {
    cockpit.superuser.reload_page_on_change();
};

/** Whether the session currently holds administrative access. */
export const hasSuperuser = (): boolean => cockpit.superuser.allowed === true;
