import { z } from "zod";
import {
  AudienceSchema,
  LanguageTagSchema,
  ProjectSchema,
  SCHEMA_VERSION,
} from "./architecture.js";

export const DETAIL_LEVELS = ["high-level", "medium", "detailed"] as const;
export const DetailLevelSchema = z
  .enum(DETAIL_LEVELS)
  .describe(
    "high-level: systems only. medium: services, data stores and queues. detailed: also the main modules inside services.",
  );

export const DEFAULT_IGNORE = ["node_modules", "dist", "build", ".git", "vendor"];
export const DEFAULT_HISTORY_LIMIT = 20;

export const DetectedSignalSchema = z.strictObject({
  name: z.string().min(1).describe("What was detected, e.g. 'Docker Compose'."),
  files: z.array(z.string()).default([]).describe("Files that revealed it."),
});

export const ArchbookConfigSchema = z
  .strictObject({
    $schema: z.string().optional(),
    version: z.literal(SCHEMA_VERSION),
    project: ProjectSchema,
    audience: AudienceSchema.default("developers"),
    language: LanguageTagSchema.default("en"),
    detailLevel: DetailLevelSchema.default("medium"),
    flows: z
      .array(z.string().min(1))
      .default([])
      .describe("The most important flows to document, in plain language."),
    externalContext: z
      .string()
      .optional()
      .describe("External systems or infrastructure that do not appear in the code."),
    ignore: z.array(z.string().min(1)).default(DEFAULT_IGNORE),
    detected: z.array(DetectedSignalSchema).default([]),
    history: z
      .strictObject({
        limit: z.number().int().min(1).max(1000).default(DEFAULT_HISTORY_LIMIT),
      })
      .default({ limit: DEFAULT_HISTORY_LIMIT })
      .describe("How many snapshots of architecture.json to keep in archbook/.history."),
  })
  .describe("Archbook project configuration (archbook/config.json).");

export type DetailLevel = z.infer<typeof DetailLevelSchema>;
export type DetectedSignal = z.output<typeof DetectedSignalSchema>;
export type ArchbookConfig = z.output<typeof ArchbookConfigSchema>;
export type ArchbookConfigInput = z.input<typeof ArchbookConfigSchema>;
