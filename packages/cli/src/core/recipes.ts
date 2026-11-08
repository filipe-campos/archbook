import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { formatIssuePath, issuesFromZod, RecipeFileSchema } from "@archbook/schema";
import { parse } from "yaml";
import { z } from "zod";
import { pluginDir } from "../package.js";

const RecipeFrontmatterSchema = z.strictObject({
  detect: z
    .array(
      z.strictObject({
        name: z.string().min(1),
        packages: z.array(z.string().min(1)).min(1),
      }),
    )
    .min(1),
});

/** npm dependencies that reveal a technology, declared in the frontmatter of its recipe. */
export interface PackageRule {
  name: string;
  packages: string[];
  recipe: string;
}

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

export const recipesDir = (plugin: string = pluginDir()) =>
  path.join(plugin, "skills", "detection-recipes", "recipes");

/**
 * Reads the `detect` frontmatter of one recipe. A recipe without frontmatter declares no packages.
 * Invalid frontmatter throws: recipes ship with the CLI, so it is a bug, not a user error.
 */
export function parseRecipe(file: string, text: string): PackageRule[] {
  const fail = (reason: string) => new Error(`Invalid detection recipe ${file}: ${reason}`);
  const name = RecipeFileSchema.safeParse(file);
  if (!name.success) throw fail(name.error.issues[0]?.message ?? "invalid file name");

  const match = FRONTMATTER.exec(text);
  if (!match) return [];
  let data: unknown;
  try {
    data = parse(match[1]!);
  } catch (error) {
    throw fail(`frontmatter is not valid YAML. ${(error as Error).message}`);
  }
  const parsed = RecipeFrontmatterSchema.safeParse(data);
  if (!parsed.success) {
    const issues = issuesFromZod(parsed.error).map(
      (issue) => `${formatIssuePath(issue.path)}: ${issue.message}`,
    );
    throw fail(issues.join("; "));
  }
  return parsed.data.detect.map((rule) => ({ ...rule, recipe: file }));
}

/** Package rules of every recipe in `dir`, by file name. Files starting with `_` are templates. */
export function loadPackageRules(dir: string = recipesDir()): PackageRule[] {
  return readdirSync(dir)
    .filter((file) => file.endsWith(".md") && !file.startsWith("_"))
    .sort()
    .flatMap((file) => parseRecipe(file, readFileSync(path.join(dir, file), "utf8")));
}
