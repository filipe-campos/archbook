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
    include: ["test/**/*.test.{ts,tsx}"],
  },
});
