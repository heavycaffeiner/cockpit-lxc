import js from "@eslint/js";
import tseslint from "typescript-eslint";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

export default tseslint.config(
    { ignores: ["dist/**", "node_modules/**"] },

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
        },
    },

    {
        files: ["build.js", "build/**/*.js"],
        languageOptions: { globals: { ...globals.node } },
    },
);
