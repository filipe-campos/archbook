---
description: Make a change to the architecture.json contract and carry it through tests, docs, the plugin, the viewer and the example
argument-hint: "<what should change in the schema>"
---

# Change the schema

Requested change: `$ARGUMENTS`

If it is empty, ask what should change and stop.

1. Load the `dev-schema` skill and follow it. Read `docs/schema.md` and the "Schema" section of `docs/decisions.md` before deciding the shape.
2. If the change is breaking (a field becomes required, a value stops being valid, a kind is renamed), say so and ask before going on.
3. Implement it in `packages/schema` with tests, then update every item in the skill's table "Everything that moves with a schema change". Load `dev-viewer` if the viewer needs to show the new data.
4. Run `/dev:check`.
5. Delegate a final pass to the `contract-reviewer` agent with the list of changed files.

Report the change, the files touched grouped by package, and any decision you recorded.
