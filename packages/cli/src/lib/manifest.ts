import { formatIssuePath } from "@archbook/schema";
import { z } from "zod";
import { readTextIfExists, writeJson } from "./fs.js";
import { isSafeProjectPath, relativePath, type ProjectPaths } from "./project.js";
import { UserError } from "../errors.js";

/** Relative to the project root, with forward slashes. */
const entryPath = z.string().refine(isSafeProjectPath, {
  error: "must be a relative path inside the project, with forward slashes and no . or .. segments",
});

/** A file Archbook created. Removed only if unchanged, or after asking. */
const CreatedFileSchema = z.strictObject({
  path: entryPath,
  change: z.literal("created"),
  hash: z.string(),
});

/** An existing file the user allowed Archbook to overwrite; `original` is restored on removal. */
const ReplacedFileSchema = z.strictObject({
  path: entryPath,
  change: z.literal("replaced"),
  hash: z.string(),
  original: z.string(),
});

/** Text Archbook appended to a file (e.g. .gitignore). Removal strips exactly that text. */
const ModifiedFileSchema = z.strictObject({
  path: entryPath,
  change: z.literal("modified"),
  hash: z.string(),
  appended: z.string(),
  /** True when the file did not exist before; it is deleted if nothing else is left in it. */
  createdFile: z.boolean(),
});

/** A directory Archbook created; removed only when empty. */
const CreatedDirectorySchema = z.strictObject({
  path: entryPath,
  change: z.literal("created-dir"),
});

export const ManifestEntrySchema = z.discriminatedUnion("change", [
  CreatedFileSchema,
  ReplacedFileSchema,
  ModifiedFileSchema,
  CreatedDirectorySchema,
]);

export const ManifestSchema = z.strictObject({
  archbookManifest: z.literal(1),
  archbookVersion: z.string(),
  updatedAt: z.string(),
  entries: z.array(ManifestEntrySchema),
});

export type CreatedFile = z.infer<typeof CreatedFileSchema>;
export type ReplacedFile = z.infer<typeof ReplacedFileSchema>;
export type ModifiedFile = z.infer<typeof ModifiedFileSchema>;
export type CreatedDirectory = z.infer<typeof CreatedDirectorySchema>;
export type ManifestEntry = z.infer<typeof ManifestEntrySchema>;
export type Manifest = z.infer<typeof ManifestSchema>;

/**
 * Returns `undefined` when there is no manifest. A manifest that exists but cannot be trusted is an
 * error, because `remove` deletes and overwrites the paths it lists.
 */
export function readManifest(paths: ProjectPaths): Manifest | undefined {
  const text = readTextIfExists(paths.manifest);
  if (text === undefined) return undefined;
  const invalid = (reason: string) =>
    new UserError(
      `${relativePath(paths.root, paths.manifest)} is invalid (${reason}). ` +
        "Fix it, or delete it to remove Archbook in conservative mode.",
    );
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (error) {
    throw invalid(`not valid JSON: ${(error as Error).message}`);
  }
  const parsed = ManifestSchema.safeParse(data);
  if (!parsed.success) {
    const issue = parsed.error.issues[0]!;
    throw invalid(`${formatIssuePath(issue.path as Array<string | number>)}: ${issue.message}`);
  }
  return parsed.data;
}

export class ManifestRecorder {
  private readonly entries = new Map<string, ManifestEntry>();

  constructor(
    private readonly paths: ProjectPaths,
    private readonly version: string,
  ) {
    for (const entry of readManifest(paths)?.entries ?? []) this.entries.set(entry.path, entry);
  }

  get(path: string): ManifestEntry | undefined {
    return this.entries.get(path);
  }

  record(entry: ManifestEntry): void {
    const previous = this.entries.get(entry.path);
    // Keep the original state from the first install, so removal restores what the user had.
    if (previous?.change === "replaced" && entry.change === "created") {
      this.entries.set(entry.path, { ...previous, hash: entry.hash });
    } else if (previous?.change === "modified" && entry.change === "modified") {
      this.entries.set(entry.path, {
        ...entry,
        appended: previous.appended + entry.appended,
        createdFile: previous.createdFile,
      });
    } else {
      this.entries.set(entry.path, entry);
    }
  }

  save(): void {
    const manifest: Manifest = {
      archbookManifest: 1,
      archbookVersion: this.version,
      updatedAt: new Date().toISOString(),
      entries: [...this.entries.values()],
    };
    writeJson(this.paths.manifest, manifest);
  }
}
