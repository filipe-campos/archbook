---
description: Generate archbook/architecture.json from the codebase (components, connections, groups and replayable flows)
allowed-tools: Read, Glob, Grep, Skill, Agent, Edit(./archbook/architecture.json), Edit(./archbook/.drafts/**), Bash(archbook validate *), Bash(archbook snapshot *), Bash(archbook merge *), Bash(archbook format *), Bash(npx archbook validate *), Bash(npx archbook snapshot *), Bash(npx archbook merge *), Bash(npx archbook format *)
---

# Generate the architecture document

Build `archbook/architecture.json` for the project in the current directory: its components (nodes), how they talk (edges), where they run (groups) and its most important flows, all backed by code the agents opened. You orchestrate; subagents do the reading.

## Ground rules

- Only edit `archbook/architecture.json` and the drafts in `archbook/.drafts/`. Never touch project source code or any other file.
- Never cite a file nobody opened or listed. `lines` only for ranges someone read.
- Prefer fewer, well-explained nodes over many shallow ones; respect `detailLevel`.
- Stable ids: reuse existing ids for the same element; new ids are kebab-case and descriptive (`orders-api`, `web-app-to-orders-api`).
- Ask the user nothing unless you are blocked and a user is present. In a non-interactive run, take the conservative choice and mention it in the report.
- `npx archbook` and `archbook` are the same CLI; call `archbook` directly when the session says it is on PATH. Use Read, Glob and Grep for files and run no other shell commands.
- Subagents start with an empty context. Everything they need must be in the prompt you give them.

## 1. Inputs

1. Read `archbook/config.json`. If it is missing, tell the user to run `npx archbook init` and stop.
2. Read `archbook/architecture.json` if it exists. Its ids are the ones to reuse. Its `owner`, `links` and `position` values are user-curated; the merge in step 5 carries them over for every id you keep.
3. Prepare the **config brief** you pass to every subagent: project name and description, `audience`, `language`, `detailLevel`, `ignore`, `externalContext`, `detected`.

## 2. Snapshot

Run `npx archbook snapshot --op generate` before anything writes. If it fails, stop and report the error. If it warns about uncommitted changes, continue (the snapshot preserves them) and mention it in the report. It ends with three lines: `Time: <ISO 8601 UTC>`, `Schema: <URL>` and `Generated-By: <value>`. They give `generatedAt`, `$schema` and `generatedBy`.

## 3. Scan

Launch `archbook:scanner` with the Agent tool. Its prompt: the config brief and, when the file existed, every group (id, name, parent), node (id, kind, name, group, source paths) and edge (id, from, to, kind, label), with the instruction to reuse those ids and to justify in `notes` every existing element it drops. It returns the draft: `{ groups, nodes, edges, notes }`.

## 4. Trace flows

Flows to trace: every entry of `flows` in the config, plus every flow of the existing file that no configured entry covers (use its name, trigger and summary as the description, so flows added with `/archbook:add-flow` survive). Give each a flow id: the existing one when it is the same flow, otherwise a short kebab-case id (`checkout`). If there are no flows, skip this step and suggest `/archbook:add-flow` in the report.

Launch one `archbook:flow-tracer` per flow, all in a single message so they run in parallel. Each prompt: the flow description verbatim, its flow id, the config brief, the draft nodes and edges (ids, kinds, names, groups, from/to, labels, source paths) and the existing flow object when there is one. Each returns `{ flow, newEdges, newNodes, notes }`.

## 5. Merge the drafts

You decide what goes into the document; the CLI does the merging. Write each draft with the Write tool under `archbook/.drafts/`, then run `npx archbook merge --draft <file>`. The command validates the result, writes `archbook/architecture.json` with the canonical key order and spacing, deletes the draft and prints a JSON report: `added`, `removed`, `reused`, `renamed`, `replaced`, `preserved` and `validation`. When `written` is `false`, the result failed the schema and nothing changed: fix the draft and run the command again.

1. **Structure.** Write `archbook/.drafts/structure.json` with the scanner's `groups`, `nodes` and `edges`, plus the document fields: `$schema` and `generatedBy` from the snapshot lines, `version` (`"0.1"`), `project` (`name`, `description`, `repoUrl` when set, `defaultBranch`, all from the config), `audience`, `language` and `generatedAt`. Keep an element of the previous file in the draft unless the scanner gave evidence that it is gone. Order nodes from the outside in: actors, apps, services, workers, queues, data stores, external systems. Run `npx archbook merge --draft archbook/.drafts/structure.json --replace-structure`. The draft's groups, nodes and edges replace the document's, and the previous `owner`, `links` and `position` carry over for every id you kept.
2. **Flows.** For each tracer that found its flow, write its output to `archbook/.drafts/flow-<flow id>.json` and run `npx archbook merge --draft archbook/.drafts/flow-<flow id>.json`, one draft at a time. Before writing, remove `newNodes` entries that are an existing component under another id, and point their `newEdges` at that component's id. The merge adds nodes whose id is new, reuses an existing edge with the same `from`, `to` and `kind`, gives a clashing edge id a numeric suffix, points the steps at the result, and replaces the flow with the same id.
3. Leave out a flow whose tracer could not find it in the code. If the previous file had it, remove it from `flows` with Edit, and say so in the report.
4. Keep the reports: `added` and `removed` feed the final report, and `renamed` tells the writer which ids changed.

## 6. Write the prose

Launch `archbook:writer`. Its prompt: `audience`, `language`, `detailLevel`; the ids of all groups, nodes, edges and flows; the scanner's and tracers' notes; and, for ids that existed before, their previous `summary` and `description` so it keeps what is still accurate. It edits the file in place.

## 7. Validate

Launch `archbook:validator`. If it reports errors it could not fix, fix the ones you have evidence for and launch it once more. Then run `npx archbook validate` yourself as the final check.

## 8. Report

Keep it short:

- Counts of groups, nodes, edges and flows, plus ids added and removed compared with the previous file.
- Warnings left (code and element) and the uncertainties from the agents' notes worth a human look.
- Next steps: `npx archbook dev` to open the viewer, `npx archbook undo` to restore the previous version, `/archbook:explain <node-id>` for a deeper description of one component, `/archbook:add-flow <description>` for another flow.
