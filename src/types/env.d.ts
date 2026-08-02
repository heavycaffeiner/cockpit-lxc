/**
 * Build-time constants.
 *
 * esbuild's `define` substitutes process.env.NODE_ENV with a string literal
 * before the bundle is emitted, so this identifier never survives into the
 * shipped code and no Node.js runtime is implied. Declaring it here rather than
 * pulling in @types/node keeps Node's globals out of browser code, where
 * referencing them would be a bug rather than a convenience.
 */
declare const process: {
    readonly env: {
        readonly NODE_ENV: "development" | "production";
    };
};
