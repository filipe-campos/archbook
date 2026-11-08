import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { detectStack, FILE_RULES } from "../src/core/detect.js";
import { loadPackageRules, parseRecipe, recipesDir } from "../src/core/recipes.js";
import { repoRoot, tempProject } from "./helpers.js";

const sourceRecipes = recipesDir(path.join(repoRoot, "plugin"));
const read = (file: string) => readFileSync(path.join(sourceRecipes, file), "utf8");
const WITHOUT_PACKAGES = ["docker-compose.md"];

describe("detection recipe frontmatter", () => {
  const recipes = readdirSync(sourceRecipes).filter(
    (file) => file.endsWith(".md") && !file.startsWith("_"),
  );

  it.each(recipes.filter((file) => !WITHOUT_PACKAGES.includes(file)))(
    "%s declares the packages that reveal it",
    (file) => {
      const rules = parseRecipe(file, read(file));
      expect(rules.length).toBeGreaterThan(0);
      for (const rule of rules) expect(rule.recipe).toBe(file);
    },
  );

  it.each(WITHOUT_PACKAGES)("%s has no npm package to declare", (file) => {
    expect(parseRecipe(file, read(file))).toEqual([]);
  });

  it("gives every technology one name across recipes", () => {
    const names = loadPackageRules(sourceRecipes).map((rule) => rule.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("keeps the template's example frontmatter valid", () => {
    expect(parseRecipe("template.md", read("_template.md"))).toHaveLength(1);
  });

  it("points file rules at recipes that exist", () => {
    for (const rule of FILE_RULES.filter((rule) => rule.recipe)) {
      expect(existsSync(path.join(sourceRecipes, rule.recipe!))).toBe(true);
    }
  });

  it("reads a frontmatter with CRLF line endings", () => {
    const text =
      "---\r\ndetect:\r\n  - name: Hono\r\n    packages: [hono]\r\n---\r\n\r\n# Hono\r\n";
    expect(parseRecipe("hono.md", text)).toEqual([
      { name: "Hono", packages: ["hono"], recipe: "hono.md" },
    ]);
  });

  it.each([
    ["detect:\n  - name: Hono\n    packages: [hono", "hono.md: frontmatter is not valid YAML"],
    ["detect:\n  - name: Hono", "hono.md: detect[0].packages:"],
    ["detect:\n  - name: Hono\n    packages: []", "hono.md: detect[0].packages:"],
    [
      "detect:\n  - name: Hono\n    package: [hono]",
      'hono.md: detect[0].packages: Invalid input: expected array, received undefined; detect[0]: Unrecognized key: "package"',
    ],
    ["detect: []", "hono.md: detect:"],
    [
      "title: Hono",
      'hono.md: detect: Invalid input: expected array, received undefined; (root): Unrecognized key: "title"',
    ],
  ])("rejects the frontmatter %j", (frontmatter, message) => {
    expect(() => parseRecipe("hono.md", `---\n${frontmatter}\n---\n\n# Hono\n`)).toThrow(
      `Invalid detection recipe ${message}`,
    );
  });

  it("rejects a recipe file name that is not kebab-case", () => {
    expect(() => parseRecipe("Hono.md", "# Hono\n")).toThrow("Invalid detection recipe Hono.md");
  });
});

describe("detectStack with the recipes", () => {
  it("reports every declared package with its recipe, in recipe file order", () => {
    const rules = loadPackageRules(sourceRecipes);
    const root = tempProject({
      "package.json": JSON.stringify({
        dependencies: Object.fromEntries(rules.map((rule) => [rule.packages[0], "1"])),
      }),
      "docker-compose.yml": "services: {}",
    });
    const signals = detectStack(root, [], rules);
    expect(signals.map((signal) => [signal.name, signal.recipe])).toEqual([
      ["Node.js", undefined],
      ["Docker Compose", "docker-compose.md"],
      ["AWS SQS/SNS", "aws-sqs-sns.md"],
      ["BullMQ", "bullmq.md"],
      ["Express", "express-fastify-nestjs.md"],
      ["Fastify", "express-fastify-nestjs.md"],
      ["NestJS", "express-fastify-nestjs.md"],
      ["Axios", "http-clients.md"],
      ["Kafka", "kafka.md"],
      ["Next.js", "nextjs.md"],
      ["Prisma", "prisma-typeorm.md"],
      ["TypeORM", "prisma-typeorm.md"],
      ["Redis", "redis.md"],
      ["Stripe", "stripe-webhooks.md"],
    ]);
  });

  it("matches any of a technology's packages, in any workspace manifest", () => {
    const rules = [{ name: "Kafka", packages: ["kafkajs", "node-rdkafka"], recipe: "kafka.md" }];
    const root = tempProject({
      "package.json": JSON.stringify({ devDependencies: { "node-rdkafka": "1" } }),
      "services/a/package.json": JSON.stringify({ peerDependencies: { kafkajs: "2" } }),
      "services/b/package.json": "{ not json",
    });
    expect(detectStack(root, [], rules).at(-1)).toEqual({
      name: "Kafka",
      files: ["package.json", "services/a/package.json"],
      recipe: "kafka.md",
    });
  });
});
