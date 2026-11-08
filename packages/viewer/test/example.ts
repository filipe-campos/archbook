import { readFileSync } from "node:fs";
import { ArchitectureSchema } from "@archbook/schema";

const file = new URL("../../../examples/shop-checkout/archbook/architecture.json", import.meta.url);

export const example = ArchitectureSchema.parse(JSON.parse(readFileSync(file, "utf8")));
