import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { contentSecurityPolicy } from "./csp.ts";
import { archbookDevData } from "./dev-server.ts";

const exampleFile = fileURLToPath(
  new URL("../../examples/shop-checkout/archbook/architecture.json", import.meta.url),
);

export default defineConfig({
  // Relative asset URLs, so the build works from any sub-path (GitHub Pages, file servers).
  base: "./",
  plugins: [
    react(),
    contentSecurityPolicy(),
    archbookDevData(process.env.ARCHBOOK_FILE ?? exampleFile),
  ],
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
    // The CSP has no `data:` font source, so small font subsets must stay files.
    assetsInlineLimit: (file) => (/\.woff2?$/.test(file) ? false : undefined),
    // The only chunk above Vite's 500 kB default is ELK's single-thread fallback, which loads
    // only where the layout worker cannot start.
    chunkSizeWarningLimit: 1464,
  },
});
