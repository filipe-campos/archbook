// Copies what the published package needs next to dist/: the built viewer, the Claude Code
// plugin, the JSON Schemas and the README.
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const here = (relative) => fileURLToPath(new URL(relative, import.meta.url));

const copies = [
  ["../../viewer/dist", "../viewer"],
  ["../../../plugin", "../plugin"],
];

for (const [from, to] of copies) {
  if (!existsSync(here(from)))
    throw new Error(`Missing ${here(from)}. Build the workspace with "pnpm build".`);
  rmSync(here(to), { recursive: true, force: true });
  cpSync(here(from), here(to), { recursive: true });
}

rmSync(here("../schema"), { recursive: true, force: true });
mkdirSync(here("../schema"));
for (const file of ["architecture.schema.json", "config.schema.json"]) {
  cpSync(here(`../../schema/dist/${file}`), here(`../schema/${file}`));
}

// npm resolves relative links against packages/cli, so point them at the release tag on GitHub.
const pkg = JSON.parse(readFileSync(here("../package.json"), "utf8"));
const repo = pkg.repository.url.replace(/^git\+/, "").replace(/\.git$/, "");
const ref = `v${pkg.version}`;
const readme = readFileSync(here("../../../README.md"), "utf8").replace(
  /(!?)\[([^\]]*)\]\((?!https?:|#|mailto:)([^)\s]+)\)/g,
  (_, image, text, path) => `${image}[${text}](${repo}/${image ? "raw" : "blob"}/${ref}/${path})`,
);
writeFileSync(here("../README.md"), readme);
