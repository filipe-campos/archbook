---
description: Build Archbook from this checkout and run init, generate and dev in a sample project to see the plugin working end to end
argument-hint: "<absolute path to a sample project> [--no-generate]"
---

# Try the plugin end to end

Arguments: `$ARGUMENTS`

The first argument is the sample project. If it is missing, ask for it. Never use this repository itself or `examples/shop-checkout` as the target, because `init` writes into the project's `.claude/` and `archbook/` folders.

1. Confirm the target exists and show `git -C <target> status --porcelain`. If the target has uncommitted changes, ask before going on.
2. `pnpm build` in this repository.
3. In the target: `node <repo>/packages/cli/dist/index.js init --yes`. Report the detected stack and the recipe that covers each technology.
4. Unless `--no-generate` was passed, run `node <repo>/packages/cli/dist/index.js generate` in the target. It calls Claude Code headless and can take several minutes; run it in the background and wait for it.
5. `node <repo>/packages/cli/dist/index.js validate` in the target and report the issues.
6. Tell the user to run `node <repo>/packages/cli/dist/index.js dev` in the target to open the viewer, or start it in the background if they asked for it.

To iterate on a recipe or prompt without reinstalling, edit the copy under `<target>/.claude/` and port the change back to `plugin/` afterwards. Remind the user of this if they plan to tweak prompts.

Report: detected stack, generate outcome (nodes, edges, flows), validation result, and anything in the output that looks wrong.

To undo everything in the target: `node <repo>/packages/cli/dist/index.js remove --yes`.
