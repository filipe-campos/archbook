import { readJson, writeJson } from "./fs.js";
import type { ProjectPaths } from "./project.js";

/** A file Archbook created. Removed only if unchanged, or after asking. */
export interface CreatedFile {
  path: string;
  change: "created";
  hash: string;
}

/** An existing file the user allowed Archbook to overwrite; `original` is restored on removal. */
export interface ReplacedFile {
  path: string;
  change: "replaced";
  hash: string;
  original: string;
}

/** Text Archbook appended to a file (e.g. .gitignore). Removal strips exactly that text. */
export interface ModifiedFile {
  path: string;
  change: "modified";
  hash: string;
  appended: string;
  /** True when the file did not exist before; it is deleted if nothing else is left in it. */
  createdFile: boolean;
}

/** A directory Archbook created; removed only when empty. */
export interface CreatedDirectory {
  path: string;
  change: "created-dir";
}

export type ManifestEntry = CreatedFile | ReplacedFile | ModifiedFile | CreatedDirectory;

export interface Manifest {
  archbookManifest: 1;
  archbookVersion: string;
  updatedAt: string;
  /** Paths are relative to the project root, with forward slashes. */
  entries: ManifestEntry[];
}

export function readManifest(paths: ProjectPaths): Manifest | undefined {
  const data = readJson<Manifest>(paths.manifest);
  return data?.archbookManifest === 1 && Array.isArray(data.entries) ? data : undefined;
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
