import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { archbookDevData } from "./dev-server.ts";

const exampleFile = fileURLToPath(
  new URL("../../examples/shop-checkout/archbook/architecture.json", import.meta.url),
);

export default defineConfig({
  // Relative asset URLs, so the build works from any sub-path (GitHub Pages, file servers).
  base: "./",
  plugins: [react(), archbookDevData(process.env.ARCHBOOK_FILE ?? exampleFile)],
  resolve: {
    alias: [
      {
        find: /^@archbook\/schema$/,
        replacement: fileURLToPath(new URL("../schema/src/index.ts", import.meta.url)),
      },
    ],
  },
  build: {
    outDir: "dist",
    chunkSizeWarningLimit: 2000,
  },
});
