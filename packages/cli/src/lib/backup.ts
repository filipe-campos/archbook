import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { create } from "tar";

/** Archives the given project-relative paths into `$TMPDIR/archbook-removed-<timestamp>.tar.gz`. */
export async function backupFiles(
  root: string,
  relativePaths: string[],
  directory = tmpdir(),
): Promise<string | undefined> {
  const existing = relativePaths.filter((file) => existsSync(path.join(root, file)));
  if (existing.length === 0) return undefined;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const file = path.join(directory, `archbook-removed-${stamp}.tar.gz`);
  await create({ gzip: true, file, cwd: root, portable: true }, existing);
  return file;
}
