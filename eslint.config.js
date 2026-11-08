import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

const NODE_BUILTINS = ["fs", "path", "os", "child_process", "url", "crypto"];
const OUTPUT_ONLY = "Commands print through the Output port in context.output.";
const BROWSER_SAFE =
  "The main @archbook/schema entry must stay browser-safe; Node code goes through src/node.ts.";
const PURE_VIEWER = "graph/ and lib/ stay pure; React and icons belong in components/.";

export default defineConfig(
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/coverage/**",
      "examples/**",
      "packages/cli/viewer/**",
      "packages/cli/plugin/**",
      "packages/cli/schema/**",
    ],
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" },
      ],
    },
  },
  {
    files: ["packages/viewer/src/**/*.{ts,tsx}"],
    extends: [reactHooks.configs.flat.recommended],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ["packages/viewer/src/graph/**/*.ts", "packages/viewer/src/lib/**/*.ts"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          paths: [
            ...["react", "react-dom", "lucide-react"].map((name) => ({
              name,
              message: PURE_VIEWER,
            })),
            { name: "@xyflow/react", allowTypeImports: true, message: PURE_VIEWER },
          ],
          patterns: [{ group: ["react/*", "react-dom/*"], message: PURE_VIEWER }],
        },
      ],
    },
  },
  {
    files: [
      "packages/cli/**/*.{ts,mjs}",
      "packages/schema/**/*.{ts,mjs}",
      "**/*.config.ts",
      "**/scripts/**",
      "e2e/**",
    ],
    languageOptions: { globals: globals.node },
  },
  // CLI layers: see "CLI layers" in CONTRIBUTING.md.
  {
    files: ["packages/cli/src/core/**/*.ts"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          paths: ["@clack/prompts", "picocolors", "commander"].map((name) => ({
            name,
            message: "core/ must not depend on the terminal.",
          })),
          patterns: [
            {
              group: ["**/commands/**", "**/ui/**"],
              message: "core/ must not import commands/ or ui/.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["packages/cli/src/io/**/*.ts"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/core/**", "**/commands/**", "**/ui/**"],
              message: "io/ adapters must not import core/, commands/ or ui/.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["packages/cli/src/ui/**/*.ts"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          paths: ["@clack/prompts", "commander"].map((name) => ({
            name,
            message: "ui/ only formats text.",
          })),
          patterns: [
            { group: ["**/io/**", "**/commands/**"], message: "ui/ only formats text." },
            {
              group: ["**/core/**"],
              allowTypeImports: true,
              message: "ui/ may only import types from core/.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["packages/cli/src/commands/**/*.ts"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          paths: [{ name: "@clack/prompts", message: OUTPUT_ONLY }],
          patterns: [
            {
              group: ["./*", "!./context.js"],
              message: "Commands must not import each other; share code through ./context.js.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["packages/cli/src/commands/**/*.ts", "packages/cli/src/core/**/*.ts"],
    rules: { "no-console": ["error"] },
  },
  {
    files: ["packages/schema/src/**/*.ts"],
    ignores: ["packages/schema/src/node.ts", "packages/schema/src/live-reload.ts"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          paths: NODE_BUILTINS.map((name) => ({ name, message: BROWSER_SAFE })),
          patterns: [
            {
              group: [
                "node:*",
                ...NODE_BUILTINS.map((name) => `/${name}/*`),
                "./node.js",
                "./live-reload.js",
              ],
              message: BROWSER_SAFE,
            },
          ],
        },
      ],
    },
  },
);
