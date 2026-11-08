import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      include: ["src/**"],
      reporter: ["text-summary"],
      // The coverage measured when the limits were set, rounded down; raise them as tests grow.
      thresholds: { statements: 99, branches: 97, functions: 97, lines: 100 },
    },
    include: ["test/**/*.test.ts"],
  },
});
