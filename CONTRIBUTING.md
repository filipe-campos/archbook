# Contributing to Archbook

Thanks for helping! The most valuable contribution is often the smallest: a **detection recipe** that teaches the agents to recognize one more framework, queue or data store. That is the first section below.

## Write a detection recipe

Recipes live in [`plugin/skills/detection-recipes/recipes/`](plugin/skills/detection-recipes/recipes/), one Markdown file per technology. The agents read only the recipes that match the stack they detect, so each recipe must stand on its own.

1. **Copy the template.** Copy [`_template.md`](plugin/skills/detection-recipes/recipes/_template.md) to `recipes/<technology>.md` (kebab-case, e.g. `rabbitmq.md`). Keep its six sections, in order, with the same headings:
   - **Signals**: dependencies, imports, file names and config keys, written as ripgrep patterns the Grep tool can run.
   - **Nodes**: what becomes a node, its `kind`, id pattern (`<name>-queue`), `name` and `tech`.
   - **Edges**: each interaction with its direction, `kind` and label format (`POST /orders`, `order.created`, `consume`).
   - **Sources to cite**: which lines prove each node and edge.
   - **Flow hints**: which steps are `async` or `reverse`, where payloads come from, typical `durationMs`.
   - **Pitfalls**: false positives and modelling mistakes.
2. **Declare its packages.** List the npm packages that reveal the technology in the `detect` frontmatter at the top of the recipe, one entry per technology the recipe covers. `archbook init` reads these lists to report what it detected and which recipe covers it, so the same file teaches both the agents and the CLI. Leave the frontmatter out when no npm package reveals the technology (as in `docker-compose.md`). A test checks the frontmatter of every recipe.
3. **Add it to the index** table in [`plugin/skills/detection-recipes/SKILL.md`](plugin/skills/detection-recipes/SKILL.md), and mention the technology in the skill's `description` if it is common.
4. **Check the patterns.** Run each Grep pattern against a real project that uses the technology (ripgrep: `rg '<pattern>' <project>`). Every rule should lead to a node, an edge, a source or a flow step, or prevent a wrong one.
5. **Try it end to end.** In a sample project that uses the technology:

   ```sh
   pnpm build
   node /path/to/archbook/packages/cli/dist/index.js init --yes
   node /path/to/archbook/packages/cli/dist/index.js generate
   node /path/to/archbook/packages/cli/dist/index.js dev
   ```

   `init` copies the recipes from your checkout into the sample project's `.claude/` folder. To iterate on a recipe without reinstalling, edit the copy in `.claude/skills/archbook-detection-recipes/recipes/` and port the change back.

6. **Open a pull request** with the recipe and, ideally, a short note on the project you tested it with and the nodes and edges it produced.

Good recipes are concrete. Compare [`bullmq.md`](plugin/skills/detection-recipes/recipes/bullmq.md) or [`stripe-webhooks.md`](plugin/skills/detection-recipes/recipes/stripe-webhooks.md) with your draft.

## Develop Archbook

### Setup

You need Node.js 22.18+ and pnpm 11 (the published CLI itself runs on Node 20+).

```sh
pnpm install
pnpm build      # schema, then viewer, then CLI (which bundles the viewer and the plugin)
pnpm test
pnpm dev:example
```

`pnpm dev:example` starts the viewer in Vite with hot reload, serving `examples/shop-checkout/archbook/architecture.json`. Point it at another file with `ARCHBOOK_FILE=/abs/path/architecture.json pnpm dev:example`.

### Repository layout

| Path                              | What it is                                                                                                                                             |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `packages/schema`                 | `@archbook/schema` (private): Zod schema, types, semantic validation, `diffArchitecture`, JSON Schema export. The contract everything else depends on. |
| `packages/viewer`                 | `@archbook/viewer` (private): Vite + React + React Flow app that renders `architecture.json`.                                                          |
| `packages/cli`                    | `archbook` on npm: the CLI. Its build copies the built viewer, the plugin and the JSON Schemas into the package.                                       |
| `plugin/`                         | Claude Code commands, agents and skills, in plugin form.                                                                                               |
| `.claude-plugin/marketplace.json` | Lets people install the plugin from this repository.                                                                                                   |
| `examples/shop-checkout`          | A complete example with stub sources, used by `pnpm dev:example` and the tests.                                                                        |
| `docs/`                           | [`schema.md`](docs/schema.md) and [`decisions.md`](docs/decisions.md).                                                                                 |
| `e2e/`                            | Playwright tests of the built viewer and of `archbook dev`, run against the example.                                                                   |

### CLI layers

```text
packages/cli/src/
  cli.ts      # commander wiring; maps errors to exit codes
  errors.ts   # UserError, CancelledError
  package.ts  # VERSION and where the bundled viewer and plugin live
  commands/   # one file per command: reads options, calls core/, prints through context.output
  core/       # use cases and domain rules, no terminal
  io/         # side-effect adapters: fs, git, claude, server, backup, browser, prompter, output
  ui/         # pure text formatting for the terminal (picocolors)
```

ESLint enforces these rules:

- `core/` does not import `@clack/prompts`, `picocolors`, `commander`, `commands/` or `ui/`. User decisions reach it as callbacks (`confirmOverwrite`, `confirmEdited`), not as a `Prompter`.
- `io/` does not import `core/`, `commands/` or `ui/`.
- `ui/` does not import `@clack/prompts`, `commander`, `io/` or `commands/`, and imports only types from `core/`.
- A command does not import another command; shared code lives in `commands/context.ts`.
- `commands/` and `core/` do not use `console`, and `commands/` does not import `@clack/prompts`: commands print through the `Output` in their `CommandContext` (`io/output.ts`), and tests pass `memoryOutput()`.
- The main entry of `@archbook/schema` stays browser-safe: only `src/node.ts` (and `src/live-reload.ts`, which it re-exports) may import Node built-ins.

### Viewer layers

```text
packages/viewer/src/
  Viewer.tsx   # composes hooks and components
  components/  # React components, contexts and the kind-to-icon map
  hooks/       # playback, selection, shortcuts, flow route, canvas focus, reduced motion
  data/        # loading, hash route, theme
  graph/       # pure: ELK layout, canvas elements, highlight, flow usage
  lib/         # pure helpers
```

ESLint keeps `graph/` and `lib/` free of `react`, `react-dom` and `lucide-react`; `@xyflow/react` is allowed there only with `import type`.

### Checks

CI runs these on every pull request; run them before pushing:

```sh
pnpm lint
pnpm format:check   # pnpm format fixes formatting
pnpm build
pnpm typecheck
pnpm test:coverage  # pnpm test without the coverage limits
pnpm test:e2e       # after pnpm build; once: pnpm exec playwright install chromium
```

Each package's `vitest.config.ts` sets coverage limits at the current coverage; raise them when you add tests, never lower them to make a change pass. Viewer component tests start with `// @vitest-environment happy-dom`; anything that needs the canvas belongs in the Playwright tests in `e2e/`, which build the example with the CLI and check that the page logs no errors and breaks no Content Security Policy rule.

To check the plugin manifests and frontmatter with Claude Code itself: `claude plugin validate plugin` and `claude plugin validate .`.

### Conventions

- **Everything in English**: code, comments, docs, CLI messages and prompts.
- **The schema is the contract.** A change to `packages/schema` needs tests for every new rule, an update to [`docs/schema.md`](docs/schema.md) and to the `schema` skill, and usually to the viewer.
- **Plugin names.** Files in `plugin/` refer to each other with plugin names (`/archbook:generate`, `archbook:scanner`, `archbook:schema`). `archbook init` rewrites them to `archbook-…` when it copies the files into a project. Never write the `archbook-` form inside `plugin/`; a test checks this.
- **Record decisions.** When you make a choice the docs do not cover, add a short entry to [`docs/decisions.md`](docs/decisions.md).
- **Comments explain why**, not what. Keep them short.

## Reporting bugs

Open an issue with the command you ran, what you expected, what happened, and, when the bug is about generated content, the relevant part of `archbook/architecture.json` and the output of `npx archbook validate`.

When the CLI prints `Unexpected error`, run the command again with `ARCHBOOK_DEBUG=1` set (for example `ARCHBOOK_DEBUG=1 npx archbook generate`) and include the stack trace it prints.
