import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

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
    files: [
      "packages/cli/**/*.{ts,mjs}",
      "packages/schema/**/*.{ts,mjs}",
      "**/*.config.ts",
      "**/scripts/**",
    ],
    languageOptions: { globals: globals.node },
  },
);
