import { defineConfig } from "tsup";

export default defineConfig({
  entry: { index: "src/index.ts" },
  format: ["esm"],
  target: "node20",
  platform: "node",
  clean: true,
  sourcemap: true,
  banner: { js: "#!/usr/bin/env node" },
  // The schema package is private, so it ships inside the CLI bundle.
  noExternal: ["@archbook/schema"],
  esbuildOptions(options) {
    options.conditions = ["@archbook/source"];
  },
});
