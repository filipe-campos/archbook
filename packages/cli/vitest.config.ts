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
    include: ["test/**/*.test.ts"],
    testTimeout: 20_000,
  },
});
