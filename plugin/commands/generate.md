---
description: Generate archbook/architecture.json from the codebase (components, connections, groups and replayable flows)
allowed-tools: Read, Glob, Grep, Skill, Agent, Edit(./archbook/architecture.json), Bash(archbook validate *), Bash(archbook snapshot *), Bash(archbook --version *), Bash(npx archbook validate *), Bash(npx archbook snapshot *), Bash(npx archbook --version *)
---

# Generate the architecture document

Build `archbook/architecture.json` for the project in the current directory: its components (nodes), how they talk (edges), where they run (groups) and its most important flows, all backed by code the agents opened. You orchestrate; subagents do the reading.

## Ground rules

- Only edit `archbook/architecture.json`. Never touch project source code or any other file.
- Never cite a file nobody opened or listed. `lines` only for ranges someone read.
- Prefer fewer, well-explained nodes over many shallow ones; respect `detailLevel`.
- Stable ids: reuse existing ids for the same element; new ids are kebab-case and descriptive (`orders-api`, `web-app-to-orders-api`).
- Ask the user nothing unless you are blocked and a user is present. In a non-interactive run, take the conservative choice and mention it in the report.
- `npx archbook` and `archbook` are the same CLI; call `archbook` directly when the session says it is on PATH. Use Read, Glob and Grep for files and run no other shell commands.
- Subagents start with an empty context. Everything they need must be in the prompt you give them.

## 1. Inputs

1. Read `archbook/config.json`. If it is missing, tell the user to run `npx archbook init` and stop.
2. Read `archbook/architecture.json` if it exists. Its ids are the ones to reuse. Its `owner`, `links` and `position` values are user-curated: carry them over for every id you keep.
3. Run `npx archbook --version`. `generatedBy` is `archbook@<version> + claude-code`.
4. Prepare the **config brief** you pass to every subagent: project name and description, `audience`, `language`, `detailLevel`, `ignore`, `externalContext`, `detected`.

## 2. Snapshot

Run `npx archbook snapshot --op generate` before anything writes. If it fails, stop and report the error. If it warns about uncommitted changes, continue (the snapshot preserves them) and mention it in the report. It ends with a `Time: <ISO 8601 UTC>` line: use that value for `generatedAt`.

## 3. Scan

Launch `archbook:scanner` with the Agent tool. Its prompt: the config brief and, when the file existed, every group (id, name, parent), node (id, kind, name, group, source paths) and edge (id, from, to, kind, label), with the instruction to reuse those ids and to justify in `notes` every existing element it drops. It returns the draft: `{ groups, nodes, edges, notes }`.

## 4. Trace flows

Flows to trace: every entry of `flows` in the config, plus every flow of the existing file that no configured entry covers (use its name, trigger and summary as the description, so flows added with `/archbook:add-flow` survive). Give each a flow id: the existing one when it is the same flow, otherwise a short kebab-case id (`checkout`). If there are no flows, skip this step and suggest `/archbook:add-flow` in the report.

Launch one `archbook:flow-tracer` per flow, all in a single message so they run in parallel. Each prompt: the flow description verbatim, its flow id, the config brief, the draft nodes and edges (ids, kinds, names, groups, from/to, labels, source paths) and the existing flow object when there is one. Each returns `{ flow, newEdges, newNodes, notes }`.

## 5. Assemble and write

Merge in memory:

- Add each `newEdges` entry unless an edge with the same `from`, `to` and `kind` already exists; in that case point the tracer's steps at the existing id. Skip `newNodes` entries that duplicate an existing component. Resolve id clashes between tracers by renaming and updating their steps.
- Leave out a flow whose tracer could not find it in the code, and say so in the report.
- Drop an element of the previous file only when the scanner gave evidence that it is gone.
- Check every reference: edge `from`/`to` are nodes, node `group` and group `parent` are groups, step `edge` is an edge.

Write `archbook/architecture.json` in one go, pretty-printed with 2-space indentation, with top-level keys in this order: `$schema` (`https://unpkg.com/archbook@0.1/schema/architecture.schema.json`), `version` (`"0.1"`), `project` (`name`, `description`, `repoUrl` when set, `defaultBranch`, all from the config), `audience`, `language`, `groups`, `nodes`, `edges`, `flows`, `generatedAt`, `generatedBy`. Omit empty arrays, empty optional strings and `false` booleans. Order nodes from the outside in: actors, apps, services, workers, queues, data stores, external systems.

## 6. Write the prose

Launch `archbook:writer`. Its prompt: `audience`, `language`, `detailLevel`; the ids of all groups, nodes, edges and flows; the scanner's and tracers' notes; and, for ids that existed before, their previous `summary` and `description` so it keeps what is still accurate. It edits the file in place.

## 7. Validate

Launch `archbook:validator`. If it reports errors it could not fix, fix the ones you have evidence for and launch it once more. Then run `npx archbook validate` yourself as the final check.

## 8. Report

Keep it short:

- Counts of groups, nodes, edges and flows, plus ids added and removed compared with the previous file.
- Warnings left (code and element) and the uncertainties from the agents' notes worth a human look.
- Next steps: `npx archbook dev` to open the viewer, `npx archbook undo` to restore the previous version, `/archbook:explain <node-id>` for a deeper description of one component, `/archbook:add-flow <description>` for another flow.
