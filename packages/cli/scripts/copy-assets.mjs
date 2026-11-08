// Copies what the published package needs next to dist/: the built viewer, the Claude Code
// plugin and the JSON Schemas.
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
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
