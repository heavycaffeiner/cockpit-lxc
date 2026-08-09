import js from "@eslint/js";
import tseslint from "typescript-eslint";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

export default tseslint.config(
    { ignores: ["dist/**", "node_modules/**", "src/generated/**", "test/layout/.host/**"] },

    js.configs.recommended,
    ...tseslint.configs.recommended,

    {
        files: ["src/**/*.{ts,tsx}"],
        languageOptions: {
            globals: { ...globals.browser },
            parserOptions: { ecmaFeatures: { jsx: true } },
        },
        plugins: { react, "react-hooks": reactHooks },
        settings: { react: { version: "detect" } },
        rules: {
            ...react.configs.flat.recommended.rules,
            ...reactHooks.configs.recommended.rules,
            // The new JSX transform is enabled via tsconfig "jsx": "react-jsx".
            "react/react-in-jsx-scope": "off",
            // Prop shapes are already checked by TypeScript.
            "react/prop-types": "off",
            /*
             * A leading underscore marks a parameter that exists to satisfy a
             * signature rather than to be used. The driver's not-yet-implemented
             * methods are full of them, and deleting the names would lose the
             * documentation of what each argument will be.
             */
            "@typescript-eslint/no-unused-vars": ["error", {
                argsIgnorePattern: "^_",
                varsIgnorePattern: "^_",
                caughtErrorsIgnorePattern: "^_",
            }],
        },
    },

    {
        /*
         * The backend boundary, proposal section 4.1.3.
         *
         * Only src/backend/ may talk to cockpit directly. Everything above it
         * programs against ContainerDriver, which is what keeps a future liblxc
         * driver from requiring a rewrite of the UI.
         */
        files: ["src/**/*.{ts,tsx}"],
        ignores: ["src/backend/**"],
        rules: {
            "no-restricted-imports": ["error", {
                paths: [{
                    name: "cockpit",
                    message:
                        "Import cockpit only inside src/backend/. Everything above that " +
                        "boundary talks to ContainerDriver.",
                }],
            }],
            /*
             * base1/cockpit.js publishes itself as window.cockpit, so restricting
             * the import specifier alone would leave the global as an open back
             * door around the boundary. src/backend/cockpit-runtime.ts is the one
             * file allowed to read it, and it is exempt by the `ignores` above.
             */
            "no-restricted-properties": ["error", {
                object: "window",
                property: "cockpit",
                message:
                    "Reach cockpit through ContainerDriver, not the global. Only " +
                    "src/backend/cockpit-runtime.ts may read window.cockpit.",
            }],
        },
    },

    {
        files: ["build.js", "build/**/*.js", "build/**/*.mjs"],
        languageOptions: {
            globals: { ...globals.node },
            sourceType: "module",
        },
    },

    {
        /*
         * Both global sets, because the audit runner is one file that runs in two
         * places: the page.evaluate callbacks are written here and execute in the
         * browser, so `document` and `window` are as real as `process` is.
         */
        files: ["test/layout/**/*.mjs", "test/layout/**/*.ts"],
        languageOptions: {
            globals: { ...globals.node, ...globals.browser },
            sourceType: "module",
        },
    },
);
