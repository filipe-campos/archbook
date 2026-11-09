---
name: dev-plugin
description: How to work on plugin/, the Claude Code commands, agents and skills Archbook ships to users (generate, sync, add-flow, explain, scanner, flow-tracer, writer, curator, validator, schema, writing-guide, detection-recipes). Use when editing those prompts, their allowed-tools, a detection recipe, or the marketplace manifest.
---

# Developing the plugin

`plugin/` is the product that runs inside users' projects. It is not the tooling in this `.claude/` folder. Paths are relative to the repo root.

## Map

- `plugin/.claude-plugin/plugin.json`: manifest (`name: archbook`, version tied to the packages).
- `.claude-plugin/marketplace.json`: lets people install the plugin from this repo (`source: ./plugin`).
- `plugin/commands/`: `generate`, `sync`, `add-flow`, `explain`.
- `plugin/agents/`: `scanner` and `flow-tracer` (read-only drafts), `writer` (text fields only), `curator` (presentation pass on names, labels, tech chips, step titles and payloads, never structure), `validator` (fixes until `validate` is clean).
- `plugin/skills/`: `schema` (spec of the document), `writing-guide` (tone of text fields and how they fit the viewer), `detection-recipes` (`SKILL.md` index plus `recipes/*.md`).
- `packages/cli/plugin/` is a build copy. Never edit it.

## Rules that tests enforce

- **Names.** Inside `plugin/` always write the plugin form: `/archbook:generate`, `archbook:scanner`, `archbook:schema`. Frontmatter `name:` is the bare name (`scanner`). `archbook init` rewrites them to `archbook-<name>` (`packages/cli/src/core/assets.ts`). Never write `archbook-` inside `plugin/`; `packages/cli/test/assets.test.ts` checks the shipped set, the rewritten names and that every `archbook:<name>` reference exists. Run `grep -rn "archbook-" plugin/` as well, since no test greps for the literal form.
- **Shipped set.** Adding or removing a command, agent or skill means updating the expected list in `assets.test.ts`.
- **Permissions.** Every command's `allowed-tools` must contain exactly `ARCHBOOK_BASH_RULES` and `ARCHBOOK_EDIT_RULES` from `packages/cli/src/io/claude.ts`, with no wildcard `Bash(archbook *)` and no destructive subcommand (`remove`, `undo`, `init`, `generate`, `build`, `dev`). Exposing a new CLI subcommand to agents means changing `ARCHBOOK_SUBCOMMANDS` and every command's frontmatter together (`describe("permissions")` in `assets.test.ts`).
- **Schema docs.** `plugin/skills/schema/SKILL.md` and `plugin/agents/validator.md` must list every validation code with the right severity, and `plugin/commands/*.md` must use `SCHEMA_VERSION` in `$schema` URLs (`packages/schema/test/contract-docs.test.ts`).
- **Versions.** `plugin.json` moves with the package versions (`describe("versions")` in `assets.test.ts`).

## Detection recipes

The full contributor workflow is in `CONTRIBUTING.md`, section "Write a detection recipe". Key facts:

- Start from `plugin/skills/detection-recipes/recipes/_template.md`. Kebab-case file name, six sections in order: Signals, Nodes, Edges, Sources to cite, Flow hints, Pitfalls. English, about 45 to 80 lines, Grep patterns are ripgrep regexes.
- The `detect` frontmatter (`- name: <Tech>` with `packages: [...]`) is parsed by `RecipeFrontmatterSchema` in `packages/cli/src/core/recipes.ts` and drives `archbook init` detection. Omit it only when no npm package reveals the technology, and then add the file to `WITHOUT_PACKAGES` in `packages/cli/test/recipes.test.ts`.
- `recipes.test.ts` has a `detectStack` test with the expected `[name, recipe]` pairs in order; update it for every new technology.
- Add a row to the index table in `plugin/skills/detection-recipes/SKILL.md` and, for common technologies, mention it in that skill's `description`.

## Prompt style

- The agents start with an empty context: commands must pass everything a subagent needs in its prompt.
- Agents only cite files someone opened. Prefer deterministic CLI tools (`archbook validate --json`, `snapshot`, `merge`, `format`) over asking the model to check things itself.
- English only, no em dashes.

## Checks

```sh
pnpm --filter archbook test          # assets, recipes, permissions, versions
pnpm --filter @archbook/schema test  # contract-docs
claude plugin validate plugin
claude plugin validate .
```

To try a change end to end, see `/dev:try-plugin`.
