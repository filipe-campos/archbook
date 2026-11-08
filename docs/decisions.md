# Decisions

Choices made where the v0.1 brief left room, newest topics last. Each entry says what was decided and why.

## Packaging and tooling

- **Only `archbook` is published.** `@archbook/schema` and `@archbook/viewer` are `private`. The CLI bundles the schema code with tsup and copies the built viewer, the plugin and the JSON Schemas into its package (`viewer/`, `plugin/`, `schema/`). No npm organization is needed for v0.1.
- **Zod 4 with its native `z.toJSONSchema()`** instead of `zod-to-json-schema`, which does not support Zod 4. The JSON Schema targets draft-07 because editors support it best, and uses the input shape, so fields with defaults are optional.
- **TypeScript 6.0, not 7.** typescript-eslint supports TypeScript up to 6.0.
- **commander 14, not 15.** commander 15 needs Node 22; the CLI supports Node 20.12+ (the floor of `@clack/prompts`).
- **Node versions.** Using the CLI needs Node 20.12+. Developing Archbook needs Node 22.18+, because tsup 9 and Vite 8 require it. CI builds on Node 22 and 24, and runs the built CLI on Node 20.
- **Live types inside the monorepo.** Package `exports` carry an `@archbook/source` condition that points at `src/`. TypeScript (`customConditions`) and esbuild resolve it, and Vite and Vitest use aliases, so typecheck, tests and `pnpm dev:example` work without building the schema first.
- **CSS modules plus one global theme file** (CSS variables for light and dark) rather than Tailwind.
- **pnpm 11 build approval.** `pnpm-workspace.yaml` allows esbuild's install script (`allowBuilds`); pnpm 11 blocks unapproved ones.

## Schema

- **All ids are strict kebab-case** (`^[a-z0-9]+(?:-[a-z0-9]+)*$`) for nodes, edges, groups and flows. Flow ids appear in URLs, and one rule is easier to remember than four.
- **Objects are strict.** Unknown keys are schema errors, so typos such as `sumary` are caught instead of ignored.
- **`FlowStep.reverse`** (added). A step can travel an edge backwards, for HTTP responses and webhook acknowledgements, without a second edge per response.
- **Flow continuity** (`discontinuous-flow` warning). The brief's rule (the next step starts where the previous ended) flags every service that calls two dependencies in a row. The rule is: a non-async step must start at a node the flow has already reached, since a synchronous call returns to its caller.
- **Extra validation codes.** `group-cycle` (nested groups must not loop, or the viewer could not lay them out) and `invalid-source-path` (absolute paths, `..` escaping the project, backslashes).
- **Source references may point to directories.** Then `lines` is an error.
- **`project.description` defaults to `""`**, as in `config.json`. A real generation omitted the empty description, which an earlier strict version of the schema rejected.
- **`position` is relative to the parent group** when the node has one, matching how the canvas nests nodes. Groups grow to fit nodes moved by hand.
- **Validation has two entry points.** `@archbook/schema` is browser-safe and checks shape and references. `@archbook/schema/node` adds the disk checks (file exists, line range fits) through a `SourceFileIndex`. The viewer runs the first; the CLI runs both.
- **`$schema` URL** is `https://unpkg.com/archbook@0.1/schema/architecture.schema.json`, served from the published CLI package.
- **Links and `repoUrl` accept only `http` and `https`.** The published site renders these values as links, and React 18 still renders `javascript:` hrefs, so any other scheme is a schema error in `architecture.json` and `config.json`. Hosts without a dot (`http://localhost:3000`, `http://grafana/`) stay valid, which is why the schema uses `z.url()` with a protocol check rather than `z.httpUrl()`. The viewer also drops non-http(s) hrefs, for documents that were never validated. This breaks documents that used other schemes, which is acceptable before 1.0.
- **`diffArchitecture` ignores key order and volatile fields** (`generatedAt`, `generatedBy`, `$schema`). It reports added, removed and changed ids per collection, plus the changed fields.

## Viewer

- **Layout.** ELK `layered`, left to right, with `INCLUDE_CHILDREN` for nested groups. Children are added in document order and cycles are broken by model order, so the first node (usually the actor) starts on the left. Groups with no nodes are not drawn.
- **Replay timing.** Real durations (1 ms to minutes) are clamped to 0.6 to 2.4 s of travel, so slower steps still look slower but nothing flashes by. Each step stays on screen for its travel time plus 1.8 s of reading time, divided by the speed.
- **URLs.** `#/flow/<id>/step/<n>` (1-based), `#/flow/<id>`, `#/node/<id>` and `#/edge/<id>`. Playback uses `replaceState`, so the browser history does not fill with steps.
- **Inspecting during a replay.** Clicking a node while a flow is open shows its details without leaving the flow; the panel goes back to the step when the replay moves on.
- **Disk checks are not repeated in the browser.** The error screen shows shape and reference errors; `archbook validate` and the `dev` terminal output cover file paths.
- **Source links** follow GitHub, GitLab and Bitbucket URL shapes, based on the host of `project.repoUrl`.

## CLI

- **Project root.** Commands walk up to the nearest folder with `archbook/config.json`, `architecture.json` or `.manifest.json`, so they work from sub-folders. `init` always uses the current folder.
- **Snapshots** are one JSON file each in `archbook/.history/<timestamp>-<operation>.json`, holding the exact text of `architecture.json` (or `null` when it did not exist) with its metadata, so restoring is byte for byte. A snapshot is skipped when the newest one already holds the same content.
- **`undo` restores the newest snapshot that differs from the current file** (restoring an identical one would look like a no-op), after snapshotting the current state as `undo`. Running it twice therefore redoes.
- **`snapshot` prints `Time: <ISO 8601>`.** Headless sessions cannot run `date`, so the commands take `generatedAt` from this line.
- **Uncommitted changes** to `architecture.json` produce a warning in `generate` and in `snapshot --op generate|sync`. Nothing is blocked, because the snapshot keeps them.
- **`.gitignore`** gets `archbook/.history/` and `archbook/dist/` (the build output is an artifact too).
- **`init --yes`** answers every question with its default and does not start a generation unless `--generate` is passed, so automation never spends tokens by surprise.
- **Re-running `init`** updates assets that are unchanged since the last install, and asks before overwriting anything else. An overwritten user file is recorded with its original content, which `remove` restores.

## Claude Code integration

- **Plugin names are the source of truth.** Files in `plugin/` use plugin names: `/archbook:generate`, the `archbook:scanner` agent, the `archbook:schema` skill. `init` copies them to `.claude/` with an `archbook-` prefix and rewrites the references, because project folders have no namespaces.
- **How `generate` starts Claude Code.** It runs `claude -p "/archbook-generate"` when `init` installed the command, otherwise `claude -p "/archbook:generate" --plugin-dir <bundled plugin>`, with `--output-format stream-json --verbose`.
- **Slash command fallback.** Claude Code passes an unknown slash command to the model as plain text, so `generate` checks `slash_commands` in the `system/init` message. When the command is missing it stops that session and sends the command's instructions as the prompt.
- **Permissions.** The session gets Read, Glob, Grep, Skill, `Edit(./archbook/architecture.json)` (which also covers Write) and Bash only for `archbook validate`, `archbook snapshot` and `archbook --version` (with or without `npx`), read-only `git` subcommands, `ls` and `wc`. The plugin commands' `allowed-tools` use the same Archbook rules, and a test keeps them in sync. Code being scanned can carry prompt injection, so the session cannot run `remove`, `undo` or `init`, or rewrite `config.json` and `.manifest.json`. Agents keep plain `Edit` and `Bash`, because their `tools` field cannot restrict subcommands. The Agent tool needs no permission.
- **`archbook` on PATH.** `npx` ignores binaries on PATH, so the session gets a temporary `archbook` shim that runs the same CLI build, plus an appended system prompt. The prompt says to use `archbook` instead of `npx archbook` and that no user can answer questions.
- **Failure handling.** A non-zero exit, an error result or Ctrl+C restores the snapshot. Output that is not valid JSON or fails the schema is also restored, and the broken file is kept in the temp folder. Output with only semantic errors (a wrong path, say) is kept and reported, so `/archbook-generate` or a quick fix can finish it.
- **Plugin removal.** `archbook remove` reads `claude plugin list --json` and prints the exact `claude plugin uninstall <id> --scope <scope>` command when an Archbook plugin is installed.

## Remove

- **Manifest entries**: `created` (with the content hash), `replaced` (with the original content), `modified` (the exact text appended, plus whether the file was created) and `created-dir`.
- **`archbook/` is deleted as a whole only when `init` created it.** Otherwise only Archbook's own files inside it are removed.
- **Edited files.** Interactively, `remove` asks about each file whose hash changed. With `--yes`, or without a terminal, it keeps them and lists them.
- **Without a manifest** (conservative mode), `remove` targets `archbook/` and the `archbook-*` entries in `.claude/commands|agents|skills`, and always requires an interactive confirmation, even with `--yes`.
- **The manifest is validated.** `archbook/.manifest.json` is committed and editable, so `remove` and `init` check its shape and require every path to be relative, canonical and inside the project. An invalid manifest stops the command with an error instead of falling back to conservative mode. Every path is also resolved against the project root before anything is deleted or written.
- **Backups** are written with node-tar to `$TMPDIR/archbook-removed-<timestamp>.tar.gz`, for portability.
- **Removing appended text** strips the exact bytes that were added, so a `.gitignore` without a trailing newline comes back identical. If the user edited the block, its lines are removed one by one, and lines added later stay.

## Open points

- **Windows.** Windows has not been tested in v0.1. The `archbook` shim has a `.cmd` variant, but spawning `claude` there may need `shell: true`.
