import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import globals from "globals";

export default [
    js.configs.recommended,
    prettier,
    {
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: "module",
            globals: {
                ...globals.browser,
                ...globals.node,
                ...globals.worker,
                DedicatedWorkerGlobalScope: "readonly",
                SharedWorkerGlobalScope: "readonly",
                ServiceWorkerGlobalScope: "readonly"
            }
        },
        rules: {
            "no-unused-vars": ["warn", { "argsIgnorePattern": "^_", "varsIgnorePattern": "^_", "args": "none" }],
            "no-console": ["warn", { allow: ["warn", "error"] }]
        },
        ignores: ["dist/", "docs/", "tests/", "benchmarks/"]
    }
];
