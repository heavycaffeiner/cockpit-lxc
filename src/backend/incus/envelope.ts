import { ApiError, DriverError } from "../errors";

/**
 * Incus wraps every response in an envelope with a `type` discriminator.
 *
 * Handling this correctly is the most load-bearing detail in the client. An
 * `async` envelope is not a result: it means the work is still in flight, and
 * treating it as one produces a UI that reports success while the operation is
 * still running or has already failed.
 */
export type EnvelopeType = "sync" | "async" | "error";

export interface Envelope {
    type: EnvelopeType;
    status?: string;
    status_code?: number;
    operation?: string;
    error_code?: number;
    error?: string;
    metadata?: unknown;
}

const ENVELOPE_TYPES: ReadonlySet<string> = new Set(["sync", "async", "error"]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Parse and validate a response body.
 *
 * The `type` field is checked against the three known values before any other
 * field is read, so a malformed or unexpected body raises a parse error instead
 * of being silently treated as a successful sync response with undefined
 * metadata. This is a trust boundary: the body arrives from another process.
 */
export const parseEnvelope = (body: string): Envelope => {
    let parsed: unknown;

    try {
        parsed = JSON.parse(body);
    } catch {
        throw new DriverError("parse", "Incus returned a body that is not valid JSON");
    }

    if (!isRecord(parsed))
        throw new DriverError("parse", "Incus returned a JSON value that is not an object");

    const type = parsed["type"];
    if (typeof type !== "string" || !ENVELOPE_TYPES.has(type)) {
        throw new DriverError(
            "parse",
            `Incus returned an unrecognised envelope type: ${JSON.stringify(type)}`,
        );
    }

    return parsed as unknown as Envelope;
};

/**
 * Turn an `error` envelope into an ApiError.
 *
 * `error_code` carries an HTTP status. It is defaulted to 500 rather than left
 * undefined, because every caller branches on the status and an undefined there
 * would silently fall through the mapping in 5-2 of the proposal.
 */
export const envelopeToApiError = (envelope: Envelope): ApiError =>
    new ApiError(
        typeof envelope.error_code === "number" ? envelope.error_code : 500,
        typeof envelope.error === "string" && envelope.error !== ""
            ? envelope.error
            : "Incus reported an error without a message",
    );
