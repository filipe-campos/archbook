import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  ARCHITECTURE_SCHEMA_URL,
  ArchbookConfigSchema,
  ArchitectureSchema,
  CONFIG_SCHEMA_URL,
  DEFAULT_HISTORY_LIMIT,
  DEFAULT_IGNORE,
  LanguageTagSchema,
  ProjectSchema,
  SCHEMA_VERSION,
  validateConfig,
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

  it.each(["javascript:alert(1)", "data:text/plain,x", "file:///repo"])(
    "rejects the repoUrl %s",
    (repoUrl) => {
      const result = ArchbookConfigSchema.safeParse({
        version: "0.1",
        project: { name: "Shop", repoUrl },
      });
      expect(result.success).toBe(false);
    },
  );

  it("accepts an https repoUrl", () => {
    const config = ArchbookConfigSchema.parse({
      version: "0.1",
      project: { name: "Shop", repoUrl: "https://github.com/o/r" },
    });
    expect(config.project.repoUrl).toBe("https://github.com/o/r");
  });
});

describe("validateConfig", () => {
  it("returns the config with defaults when valid", () => {
    const result = validateConfig({ version: "0.1", project: { name: "Shop" } });
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.config?.project.defaultBranch).toBe("main");
  });

  it("reports schema errors with the field path", () => {
    const result = validateConfig({
      version: "0.1",
      project: { name: "Shop" },
      history: { limit: "x" },
    });
    expect(result.valid).toBe(false);
    expect(result.config).toBeUndefined();
    expect(result.errors).toEqual([
      expect.objectContaining({ severity: "error", code: "schema", path: ["history", "limit"] }),
    ]);
  });

  it("shares the project shape with architecture.json", () => {
    expect(ArchbookConfigSchema.shape.project).toBe(ProjectSchema);
  });
});

describe("LanguageTagSchema", () => {
  it.each(["en", "pt-BR", "zh-Hant-TW", "fil"])("accepts %s", (tag) => {
    expect(LanguageTagSchema.safeParse(tag).success).toBe(true);
  });

  it.each(["", "e", "english language", "pt_BR", "en-"])("rejects %j", (tag) => {
    const result = LanguageTagSchema.safeParse(tag);
    expect(result.error?.issues[0]?.message).toBe("Use a language tag like en or pt-BR");
  });

  it("validates language in both config.json and architecture.json", () => {
    const config = validateConfig({ version: "0.1", project: { name: "Shop" }, language: "pt_BR" });
    expect(config.errors.map((issue) => issue.path)).toEqual([["language"]]);
    const doc = ArchitectureSchema.safeParse({
      version: "0.1",
      project: { name: "Shop" },
      language: "english",
      nodes: [],
      edges: [],
    });
    expect(doc.error?.issues.map((issue) => issue.path)).toEqual([["language"]]);
  });
});

describe("schema URLs", () => {
  it("are derived from the schema version", () => {
    expect(ARCHITECTURE_SCHEMA_URL).toBe(
      `https://unpkg.com/archbook@${SCHEMA_VERSION}/schema/architecture.schema.json`,
    );
    expect(CONFIG_SCHEMA_URL).toBe(
      `https://unpkg.com/archbook@${SCHEMA_VERSION}/schema/config.schema.json`,
    );
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
