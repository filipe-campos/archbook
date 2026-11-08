import { readFileSync } from "node:fs";
import path from "node:path";
import { ArchitectureSchema } from "@archbook/schema";

// A path, not `new URL(..., import.meta.url)`: happy-dom replaces the global URL.
const file = path.join(
  import.meta.dirname,
  "../../../examples/shop-checkout/archbook/architecture.json",
);

export const exampleText = readFileSync(file, "utf8");
export const example = ArchitectureSchema.parse(JSON.parse(exampleText));
