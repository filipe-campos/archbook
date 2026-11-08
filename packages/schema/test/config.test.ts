import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  ArchbookConfigSchema,
  ArchitectureSchema,
  DEFAULT_HISTORY_LIMIT,
  DEFAULT_IGNORE,
} from "../src/index.js";

describe("ArchbookConfigSchema", () => {
  it("fills defaults from a minimal config", () => {
    const config = ArchbookConfigSchema.parse({ version: "0.1", project: { name: "Shop" } });
    expect(config).toMatchObject({
      audience: "developers",
      language: "en",
      detailLevel: "medium",
      flows: [],
      ignore: DEFAULT_IGNORE,
      history: { limit: DEFAULT_HISTORY_LIMIT },
      project: { name: "Shop", description: "", defaultBranch: "main" },
    });
  });

  it("rejects an invalid history limit", () => {
    const result = ArchbookConfigSchema.safeParse({
      version: "0.1",
      project: { name: "Shop" },
      history: { limit: 0 },
    });
    expect(result.success).toBe(false);
  });
});

describe("JSON Schema export", () => {
  it.each([
    ["architecture", ArchitectureSchema],
    ["config", ArchbookConfigSchema],
  ])("converts the %s schema for editors", (_, schema) => {
    const json = z.toJSONSchema(schema, { io: "input", target: "draft-7" }) as {
      properties: Record<string, unknown>;
      required: string[];
    };
    expect(json.properties).toHaveProperty("version");
    expect(json.required).toContain("version");
    expect(json.required).not.toContain("audience");
  });
});
