import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const schema = (file: string) => fileURLToPath(new URL(`../schema/src/${file}`, import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@archbook\/schema\/node$/, replacement: schema("node.ts") },
      { find: /^@archbook\/schema$/, replacement: schema("index.ts") },
    ],
  },
  test: {
    coverage: {
      provider: "v8",
      include: ["src/**"],
      reporter: ["text-summary"],
      // The coverage measured when the limits were set, rounded down; raise them as tests grow.
      thresholds: { statements: 88, branches: 80, functions: 88, lines: 88 },
    },
    include: ["test/**/*.test.ts"],
    testTimeout: 20_000,
  },
});
