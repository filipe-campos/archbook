import { spawnSync } from "node:child_process";

function git(root: string, args: string[]): string | undefined {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8", timeout: 5000 });
  return result.status === 0 ? result.stdout.trim() : undefined;
}

/** Converts SSH and `.git` remotes into a browsable https URL. */
export function normalizeRemoteUrl(remote: string): string | undefined {
  const trimmed = remote.trim();
  const scp = /^[\w.-]+@([\w.-]+):(.+?)(?:\.git)?\/?$/.exec(trimmed);
  if (scp) return `https://${scp[1]}/${scp[2]}`;
  try {
    const url = new URL(trimmed);
    if (!["http:", "https:", "ssh:", "git:"].includes(url.protocol)) return undefined;
    return `https://${url.hostname}${url.pathname.replace(/\.git$/, "").replace(/\/$/, "")}`;
  } catch {
    return undefined;
  }
}

export function gitRemoteUrl(root: string): string | undefined {
  const remote = git(root, ["remote", "get-url", "origin"]);
  return remote ? normalizeRemoteUrl(remote) : undefined;
}

export function gitDefaultBranch(root: string): string | undefined {
  const head = git(root, ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"]);
  if (head) return head.replace(/^origin\//, "");
  const current = git(root, ["rev-parse", "--abbrev-ref", "HEAD"]);
  return current && current !== "HEAD" ? current : undefined;
}

/** True when the file has uncommitted changes. False outside a git repo. */
export function hasUncommittedChanges(root: string, file: string): boolean {
  const status = git(root, ["status", "--porcelain", "--", file]);
  return status !== undefined && status !== "";
}
