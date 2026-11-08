import { writeFileSync } from "node:fs";
import { z } from "zod";
import { ArchbookConfigSchema, ArchitectureSchema } from "../dist/index.js";

const outputs = [
  ["architecture.schema.json", ArchitectureSchema, "Archbook architecture"],
  ["config.schema.json", ArchbookConfigSchema, "Archbook config"],
];

for (const [file, schema, title] of outputs) {
  // "input" so fields with defaults are optional, matching what users write by hand.
  const json = z.toJSONSchema(schema, { io: "input", target: "draft-7" });
  const document = { ...json, $id: `https://unpkg.com/archbook@0.1/schema/${file}`, title };
  writeFileSync(
    new URL(`../dist/${file}`, import.meta.url),
    `${JSON.stringify(document, null, 2)}\n`,
  );
}
