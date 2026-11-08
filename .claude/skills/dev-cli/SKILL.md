---
name: dev-cli
description: How to work on packages/cli, the archbook command line tool. Use when adding or changing a CLI command, its options, prompts, errors or output, the core use cases, the io adapters (fs, git, claude, server), the headless Claude Code integration, the build, or CLI tests.
---

# Developing the CLI

Layer overview and the ESLint boundaries: `CONTRIBUTING.md`, section "CLI layers". Read it first. Paths below are relative to `packages/cli/`.

## Map

- `src/cli.ts`: `createProgram()` wires commander and `main()` maps errors to exit codes.
- `src/errors.ts`: `UserError(message, exitCode = 1)` prints `✖ message` without a stack; `CancelledError` prints "Cancelled." and exits 130. Anything else is "Unexpected error" (stack only with `ARCHBOOK_DEBUG=1`).
- `src/package.ts`: `VERSION`, `GENERATED_BY`, `cliEntry()`, `viewerDir()`, `pluginDir()`.
- `src/commands/`: `init`, `generate`, `dev`, `build`, `validate`, `format`, `history`, `undo`, `remove`, and the hidden `snapshot` and `merge`. Shared code only in `commands/context.ts` (`CommandContext`, `createContext`, `resolvePaths`).
- `src/core/`: use cases (`validation`, `history`, `project`, `detect`, `install`, `recipes`, `assets`, `formatting`, `manifest`, `removal`, `config`, `merge`, `generation/{session,stream,outcome}`).
- `src/io/`: adapters (`fs`, `git`, `claude`, `server`, `backup`, `browser`, `prompter`, `output`).
- `src/ui/`: pure picocolors formatting.

## Adding a command

1. Create `src/commands/<name>.ts` exporting `<name>Command(options, context: CommandContext): number | Promise<number>`. Copy the shape of `commands/validate.ts`.
2. Get paths with `resolvePaths(context)`. Print only through `context.output` (`intro`, `outro`, `info`, `success`, `warn`, `error`, `note`, `line`, `errorLine`, `json`, `progress`). `--json` modes use `output.json`.
3. Put the logic in `core/` and the side effects in `io/`. Formatting that is more than one line goes to `ui/`.
4. Register it in `createProgram()`: `.action(run((command) => xCommand(command.opts(), createContext(command, overrides))))`. Hidden commands use `{ hidden: true }`.
5. Validate options in commander, not in the command: custom parsers throw `InvalidArgumentError` (see `parsePort`), fixed values use `new Option(...).choices(...)`, required ones `.requiredOption`.
6. User decisions reach `core/` as optional callbacks (`confirmOverwrite`, `confirmEdited`), set only when `prompter.interactive`. A missing callback means the safe default. Non-interactive runs that need confirmation throw `UserError("... --yes ...")`.
7. Document the command in `README.md` and record any new choice in `docs/decisions.md` under "CLI".

## Claude Code integration

- `src/io/claude.ts` owns `ARCHBOOK_SUBCOMMANDS`, `ARCHBOOK_BASH_RULES`, `ARCHBOOK_EDIT_RULES` and `ALLOWED_TOOLS`. `test/assets.test.ts` checks that every plugin command's `allowed-tools` matches them exactly. A new subcommand that agents may call needs both sides updated (see the `dev-plugin` skill).
- `runHeadless` spawns `claude -p ... --output-format stream-json`. `--allowedTools` must stay the last argument because it is variadic.
- `core/generation/session.ts` prefers the installed `/archbook-generate`, falls back to the bundled plugin, and puts an `archbook` shim on PATH that runs this exact CLI.
- `core/assets.ts` copies plugin files into `.claude/` with the `archbook-` prefix and rewrites `archbook:<name>` references.

## Build and run

- `pnpm build` at the root builds schema, then viewer, then CLI. The CLI build is `tsup && node scripts/copy-assets.mjs`, which copies the viewer, the plugin and the JSON Schemas into `viewer/`, `plugin/`, `schema/` (gitignored). It fails if the other packages were not built.
- Run the built CLI against the example: `node packages/cli/dist/index.js <command> --cwd examples/shop-checkout` from the repo root.
- Contributors use Node 22.18+, but the published CLI targets Node 20.12 (`engines`, tsup `target: "node20"`). Do not use newer Node APIs.

## Tests

- `test/*.test.ts`, timeout 20 s. Helpers in `test/helpers.ts`: `tempProject(files)`, `testContext(cwd, overrides)` (non-interactive, `memoryOutput()`), `runCli(...args)` (in-process, returns `{ exitCode, output, error }`), `minimalDocument(nodes)`, `MINIMAL_CONFIG`.
- Assert on `output.text()` or `output.events` (colors stripped).
- `generate` tests use `test/fixtures/fake-claude.mjs` through `claudeBin`, driven by `FAKE_CLAUDE_SCENARIO` (`success`, `fail`, `malformed`, `malformed-stream`, `hang`, `fallback`), `FAKE_CLAUDE_DOC`, `FAKE_CLAUDE_SLASH`, `FAKE_CLAUDE_LOG`. They are skipped on Windows.
- Coverage limits in `vitest.config.ts`. Raise them when coverage grows, never lower them.

```sh
pnpm --filter archbook typecheck
pnpm --filter archbook test
```
