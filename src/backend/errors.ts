/**
 * Failure taxonomy for the backend boundary.
 *
 * Every one of these maps to a distinct, actionable state in the UI. The point
 * of the taxonomy is that no failure is allowed to surface as a generic error
 * toast: "Incus is not installed" and "you need administrative access" call for
 * completely different things from the operator, and collapsing them wastes
 * their time.
 */

/** Transport and environment failures, raised before any HTTP status exists. */
export type DriverErrorKind =
    /** The Incus socket does not exist. Incus is not installed. */
    | "not-installed"
    /** cockpit-bridge refused privileged access to the socket. */
    | "access-denied"
    /** GET /1.0 answered, but reported auth !== "trusted". */
    | "untrusted"
    /** A channel closed unexpectedly. Retryable. */
    | "transport"
    /** A response body could not be parsed. */
    | "parse";

export class DriverError extends Error {
    readonly kind: DriverErrorKind;
    readonly problem: string | undefined;

    constructor(kind: DriverErrorKind, message: string, problem?: string) {
        super(message);
        this.name = "DriverError";
        this.kind = kind;
        this.problem = problem;
    }
}

/** An error envelope returned by Incus (`type: "error"`). */
export class ApiError extends Error {
    readonly status: number;

    constructor(status: number, message: string) {
        super(message);
        this.name = "ApiError";
        this.status = status;
    }
}

/**
 * A 412 from a PUT carrying If-Match: the instance changed underneath the edit.
 *
 * `conflicts` lists only the keys that actually diverged, and `current` is the
 * server's present state. Both are needed so the UI can show a real conflict
 * instead of discarding what the operator typed.
 */
export class ConflictError<T> extends Error {
    readonly conflicts: readonly string[];
    readonly current: T;

    constructor(conflicts: readonly string[], current: T) {
        super(`Instance changed on the server; ${conflicts.length} key(s) conflict`);
        this.name = "ConflictError";
        this.conflicts = conflicts;
        this.current = current;
    }
}

/** An async operation settled with status_code 400 (Failure). */
export class OperationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "OperationError";
    }
}

/** An async operation settled with status_code 401 (Cancelled). */
export class OperationCancelled extends Error {
    constructor(message = "Operation cancelled") {
        super(message);
        this.name = "OperationCancelled";
    }
}
