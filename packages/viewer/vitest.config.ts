import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^@archbook\/schema$/,
        replacement: fileURLToPath(new URL("../schema/src/index.ts", import.meta.url)),
      },
    ],
  },
  test: {
    coverage: {
      provider: "v8",
      include: ["src/**"],
      reporter: ["text-summary"],
      // The coverage measured when the limits were set, rounded down; raise them as tests grow.
      thresholds: { statements: 53, branches: 45, functions: 48, lines: 54 },
    },
    include: ["test/**/*.test.{ts,tsx}"],
  },
});
