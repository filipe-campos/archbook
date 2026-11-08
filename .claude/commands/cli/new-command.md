---
description: Add a new archbook CLI command following the commands/core/io/ui layers, with tests and docs
argument-hint: "<command name> <what it does>"
---

# Add a CLI command

Request: `$ARGUMENTS`

If the name or purpose is missing, ask and stop.

1. Load the `dev-cli` skill and follow "Adding a command".
2. Before writing code, list the options, the exit codes and what goes into `core/`, `io/` and `ui/`. Reuse existing core functions and io adapters instead of writing new ones.
3. Write tests in `packages/cli/test/` using `runCli` or `testContext` with `memoryOutput()`.
4. Document the command in `README.md` and add a "CLI" entry to `docs/decisions.md` for any choice the docs do not cover.
5. If plugin agents should be allowed to call it, also follow the "Permissions" rule in the `dev-plugin` skill.
6. Run `/dev:check`.

Report the command usage, the files added or changed, and the test count before and after.
