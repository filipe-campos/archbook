# Claude Code tooling for developing Archbook

This folder holds the commands, agents and skills used to develop this repository. It is not the plugin Archbook ships to users; that lives in `plugin/`. Names here never use the `archbook-` prefix, which `archbook init` reserves for the files it installs.

```text
.claude/
  CLAUDE.md          # project memory loaded in every session
  settings.json      # shared permissions for the check commands
  commands/<area>/   # slash commands, invoked as /<area>:<name>
  agents/<area>/     # subagents, invoked by name
  skills/dev-<area>/ # knowledge loaded on demand
  plans/             # local plans (gitignored)
  commands/local/    # local commands (gitignored)
```

## Commands

| Area      | Command                         | What it does                                                            |
| --------- | ------------------------------- | ----------------------------------------------------------------------- |
| `dev`     | `/dev:check [quick\|full]`      | Runs the CI checks and reports failures                                 |
| `dev`     | `/dev:try-plugin <path>`        | Builds, then runs `init`, `generate` and `validate` in a sample project |
| `schema`  | `/schema:change <what>`         | Changes the contract and carries it through tests, docs and plugin      |
| `cli`     | `/cli:new-command <name>`       | Adds a CLI command across the layers, with tests and docs               |
| `recipes` | `/recipes:new <tech>`           | Writes a detection recipe                                               |
| `recipes` | `/recipes:test <recipe> <path>` | Checks a recipe's patterns against a real project                       |
| `review`  | `/review:pre-pr [base]`         | Reviews the branch with the review agents and runs the checks           |
| `release` | `/release:bump <version>`       | Moves every version that must stay in sync                              |
| `release` | `/release:publish [version]`    | Publishes the CLI to npm, tags it and creates the GitHub release        |
| `git`     | `/git:commit-push [message]`    | Checks, commits in the repository's style and pushes                    |

## Agents

| Area      | Agent                  | Use                                                                           |
| --------- | ---------------------- | ----------------------------------------------------------------------------- |
| `review`  | `conventions-reviewer` | Diff against `CONTRIBUTING.md` conventions (read-only)                        |
| `review`  | `contract-reviewer`    | Schema, plugin, permission and version changes carried everywhere (read-only) |
| `recipes` | `recipe-tester`        | Runs a recipe's Grep patterns against a project (read-only)                   |
| `testing` | `test-writer`          | Writes tests with each package's helpers and raises coverage limits           |

## Skills

| Skill        | Covers                                                                  |
| ------------ | ----------------------------------------------------------------------- |
| `dev-schema` | `packages/schema`: fields, rules, issue codes, and what moves with them |
| `dev-cli`    | `packages/cli`: layers, adding commands, Claude Code integration, tests |
| `dev-viewer` | `packages/viewer`: layers, CSP, performance, accessibility, tests       |
| `dev-plugin` | `plugin/`: naming, permissions, recipes, prompt style                   |

## Adding tooling

- A workflow someone triggers on purpose is a command in `commands/<area>/`.
- Work to delegate with its own context is an agent in `agents/<area>/`. Agents start empty: preload skills with `skills:` in the frontmatter.
- Knowledge Claude should pull in by itself is a skill in `skills/dev-<area>/SKILL.md`. Skills cannot be nested, so the `dev-` prefix groups them.
- Point to `CONTRIBUTING.md` and `docs/` instead of copying them, and update this README.
