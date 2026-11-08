import { z } from "zod";

export const SCHEMA_VERSION = "0.1";

/** Kebab-case: lowercase letters and digits separated by single hyphens. */
export const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const id = (what: string) =>
  z
    .string()
    .regex(ID_PATTERN, {
      error: `${what} id must be kebab-case (lowercase letters, digits and single hyphens), e.g. "orders-api"`,
    })
    .describe(`Stable kebab-case ${what} id. Keep it unchanged across regenerations.`);

const reference = (what: string) => z.string().min(1).describe(`Id of an existing ${what}.`);

export const NODE_KINDS = [
  "app",
  "service",
  "worker",
  "database",
  "cache",
  "queue",
  "storage",
  "external",
  "actor",
] as const;

export const NodeKindSchema = z
  .enum(NODE_KINDS)
  .describe(
    "app: frontend, mobile or CLI. service: API, backend or serverless function. worker: queue consumer, job or cron. database. cache. queue: queue, topic or stream. storage: bucket or filesystem. external: third-party system. actor: a human or another system that triggers events.",
  );

export const EDGE_KINDS = [
  "http",
  "grpc",
  "event",
  "queue",
  "db",
  "cache",
  "storage",
  "websocket",
  "other",
] as const;

export const EdgeKindSchema = z.enum(EDGE_KINDS).describe("How the two nodes communicate.");

export const AUDIENCES = ["developers", "stakeholders", "mixed"] as const;
export const AudienceSchema = z.enum(AUDIENCES);

const lineNumber = z.number().int().positive();

export const SourceRefSchema = z
  .strictObject({
    path: z
      .string()
      .min(1)
      .describe("File or directory path relative to the project root, using forward slashes."),
    symbol: z.string().min(1).optional().describe("Function, class or export name in the file."),
    lines: z
      .tuple([lineNumber, lineNumber])
      .refine(([start, end]) => start <= end, {
        error: "lines must be [start, end] with start <= end",
      })
      .optional()
      .describe("Inclusive 1-based line range: [start, end]."),
  })
  .describe("A pointer to code that implements or proves the documented behavior.");

/**
 * Absolute http or https URL. Other schemes (`javascript:`, `data:`, `file:`) are rejected because
 * the viewer renders these values as links on a published site.
 */
export const HttpUrlSchema = z.url({
  protocol: /^https?$/,
  hostname: z.regexes.hostname,
  error: "must be an absolute http or https URL",
});

export const LinkSchema = z.strictObject({
  label: z.string().min(1),
  url: HttpUrlSchema.describe("Absolute http or https URL."),
});

export const PositionSchema = z
  .strictObject({ x: z.number(), y: z.number() })
  .describe(
    "Manual layout override in pixels. Relative to the parent group when the node has a group.",
  );

export const ArchNodeSchema = z.strictObject({
  id: id("node"),
  kind: NodeKindSchema,
  name: z.string().min(1).describe("Display name, e.g. 'Orders API'."),
  summary: z.string().min(1).describe("One sentence: what this component is responsible for."),
  description: z.string().optional().describe("Full explanation in Markdown."),
  tech: z
    .array(z.string().min(1))
    .default([])
    .describe("Technologies, e.g. ['Node.js', 'Express', 'BullMQ']."),
  group: reference("group").optional(),
  sources: z.array(SourceRefSchema).default([]),
  owner: z.string().optional().describe("Owning team or person."),
  links: z.array(LinkSchema).default([]),
  position: PositionSchema.optional(),
});

export const ArchEdgeSchema = z.strictObject({
  id: id("edge"),
  from: reference("node"),
  to: reference("node"),
  kind: EdgeKindSchema,
  label: z.string().optional().describe("Short label, e.g. 'POST /orders' or 'order.created'."),
  description: z.string().optional().describe("Markdown explanation of the interaction."),
  sources: z.array(SourceRefSchema).default([]),
});

export const ArchGroupSchema = z.strictObject({
  id: id("group"),
  name: z.string().min(1).describe("e.g. 'Backend', 'AWS us-east-1', 'Billing context'."),
  description: z.string().optional(),
  parent: reference("group").optional().describe("Id of the enclosing group, for nesting."),
});

export const FlowStepSchema = z.strictObject({
  edge: reference("edge").describe("Id of the edge traversed in this step."),
  title: z.string().min(1).describe("What happens, e.g. 'API enqueues payment job'."),
  description: z.string().optional().describe("Markdown explanation of the step."),
  payload: z.unknown().optional().describe("Example payload carried in this step (any JSON)."),
  durationMs: z
    .number()
    .positive()
    .optional()
    .describe("Typical duration in milliseconds. Used to pace the replay animation."),
  async: z
    .boolean()
    .default(false)
    .describe("True when the step does not block the previous one (queues, events, webhooks)."),
  reverse: z
    .boolean()
    .default(false)
    .describe(
      "True when the step travels the edge from 'to' back to 'from', e.g. an HTTP response.",
    ),
});

export const ArchFlowSchema = z.strictObject({
  id: id("flow"),
  name: z.string().min(1).describe("e.g. 'Checkout'."),
  summary: z.string().min(1),
  trigger: z.string().min(1).describe("What starts the flow, e.g. \"User clicks 'Pay'\"."),
  steps: z.array(FlowStepSchema).min(1),
});

export const ProjectSchema = z.strictObject({
  name: z.string().min(1),
  description: z.string().default(""),
  repoUrl: HttpUrlSchema.optional().describe(
    "Http or https URL used to link source files, e.g. https://github.com/o/r.",
  ),
  defaultBranch: z.string().min(1).default("main"),
});

export const ArchitectureSchema = z
  .strictObject({
    $schema: z.string().optional(),
    version: z.literal(SCHEMA_VERSION),
    project: ProjectSchema,
    audience: AudienceSchema.default("developers"),
    language: z.string().min(2).default("en").describe("Language of the written content."),
    groups: z.array(ArchGroupSchema).default([]),
    nodes: z.array(ArchNodeSchema),
    edges: z.array(ArchEdgeSchema),
    flows: z.array(ArchFlowSchema).default([]),
    generatedAt: z.iso.datetime({ offset: true }).optional(),
    generatedBy: z.string().optional().describe("e.g. 'archbook@0.1.0 + claude-code'."),
  })
  .describe("Archbook architecture document (archbook/architecture.json).");

export type NodeKind = z.infer<typeof NodeKindSchema>;
export type EdgeKind = z.infer<typeof EdgeKindSchema>;
export type Audience = z.infer<typeof AudienceSchema>;
export type SourceRef = z.output<typeof SourceRefSchema>;
export type Link = z.output<typeof LinkSchema>;
export type ArchNode = z.output<typeof ArchNodeSchema>;
export type ArchEdge = z.output<typeof ArchEdgeSchema>;
export type ArchGroup = z.output<typeof ArchGroupSchema>;
export type FlowStep = z.output<typeof FlowStepSchema>;
export type ArchFlow = z.output<typeof ArchFlowSchema>;
export type Architecture = z.output<typeof ArchitectureSchema>;
/** The document as written on disk, before defaults are applied. */
export type ArchitectureInput = z.input<typeof ArchitectureSchema>;
