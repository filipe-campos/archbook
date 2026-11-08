---
name: dev-schema
description: How to change packages/schema, the architecture.json contract (Zod schema, semantic validation rules, ISSUE_CODES, index, format, diff, JSON Schema export). Use before adding or changing a field, a node or edge kind, a validation rule or issue code, or anything that changes what a valid architecture.json is.
---

# Changing the schema

The schema is the contract every other package, the plugin and the docs depend on. Paths are relative to `packages/schema/` unless they start with `/`.

## Map

- `src/architecture.ts`: `SCHEMA_VERSION`, `schemaUrl()`, enums (`NODE_KINDS`, `EDGE_KINDS`, `AUDIENCES`), `ID_PATTERN` and the Zod schemas. Every object is a `z.strictObject` with `.describe()` text. Types come from `z.output`.
- `src/config.ts`: `ArchbookConfigSchema` (reuses `ProjectSchema`).
- `src/issues.ts`: `ISSUE_CODES` (code to `{ severity, summary }`), `IssueCode`, `createIssue`.
- `src/indexing.ts`: `indexArchitecture` builds the shared `ArchitectureIndex` (lookups, `outgoing`, `incoming`, `stepsByEdge`, ...).
- `src/validate.ts`: Zod parse, then every rule in `RULES`.
- `src/rules/`: `ids`, `groups`, `nodes`, `edges`, `flows`, `sources`, and `index.ts` with the ordered `RULES` (order of reported issues).
- `src/format.ts` (`formatArchitecture`, key order follows the Zod shape), `src/diff.ts` (`VOLATILE_FIELDS`), `src/text.ts` (`plural`, `suggest`).
- `src/node.ts` and `src/live-reload.ts`: the only files allowed to import Node built-ins. The main entry must stay browser-safe; ESLint enforces it.

## Adding a field

1. Add it to the right `z.strictObject` in `src/architecture.ts`, with `.optional()` or `.default()` and a `.describe()` (it reaches the JSON Schema).
2. Its position in the shape is its key order in `formatArchitecture`.
3. If it must not count as a change between versions, add it to `VOLATILE_FIELDS`.

## Adding a validation rule

1. Add the code to `ISSUE_CODES` with `severity` (`"error"` or `"warning"`) and a `summary`.
2. Write an `ElementRule` or a document `Rule` in the matching `src/rules/*.ts`, calling `report(code, path, message)`. Use `suggest(value, candidates)` for unknown ids.
3. Checks that need the disk read `options.sourceFiles` and are skipped when it is absent.
4. A new lookup goes into `indexArchitecture`, with a test in `indexing.test.ts`.
5. Register the rule in `RULES` at the position its issues should appear.

## Everything that moves with a schema change

| What                                                 | Why                                                                         |
| ---------------------------------------------------- | --------------------------------------------------------------------------- |
| Tests in `test/` for every new rule or field         | Coverage limits are near 100%; use `baseDocument()` and `expectSingleError` |
| `/docs/schema.md`                                    | Field tables, and codes under `## Validation` > `### Errors`/`### Warnings` |
| `/plugin/skills/schema/SKILL.md`                     | `## Document shape` and the `## Validation codes` table                     |
| `/plugin/agents/validator.md`                        | Must list every code                                                        |
| `/examples/shop-checkout/archbook/architecture.json` | Used by schema, viewer, CLI and e2e tests; keep it valid and representative |
| `/packages/viewer`                                   | Types, rendering, details panel, when the field is user-visible             |
| `/docs/decisions.md`, section "Schema"               | Any choice the docs do not cover, including accepted breaking changes       |

`test/contract-docs.test.ts` fails when codes, severities or `SCHEMA_VERSION` URLs drift between the code, `docs/schema.md`, the skill, the validator agent, the README and the plugin commands.

`SCHEMA_VERSION` drives the `version` literal and the `$schema` URLs. Changing it breaks every existing document; do it only through `/release:bump --schema`.

## Checks

```sh
pnpm --filter @archbook/schema typecheck
pnpm --filter @archbook/schema test:coverage
pnpm build   # emits dist/{architecture,config}.schema.json
node packages/cli/dist/index.js validate --cwd examples/shop-checkout
node packages/cli/dist/index.js format --check --cwd examples/shop-checkout
```
