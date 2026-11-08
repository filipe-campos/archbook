---
description: Trace one flow through the code and add it to archbook/architecture.json, or update it if it already exists
argument-hint: <flow description>
allowed-tools: Read, Glob, Grep, Skill, Agent, Edit(./archbook/architecture.json), Edit(./archbook/.drafts/**), Bash(archbook validate *), Bash(archbook snapshot *), Bash(archbook merge *), Bash(archbook format *), Bash(npx archbook validate *), Bash(npx archbook snapshot *), Bash(npx archbook merge *), Bash(npx archbook format *)
---

# Add a flow

Flow to document: $ARGUMENTS

Trace this flow through the real code and add it to `archbook/architecture.json` so the viewer can replay it step by step.

## Ground rules

- Only edit `archbook/architecture.json` and the drafts in `archbook/.drafts/`; never project source code. Change only this flow and the edges and nodes it truly needs. Leave everything else as it is, including `generatedAt`, which `/archbook:sync` uses as its baseline.
- Never cite a file nobody opened or listed. `lines` only for ranges someone read.
- Reuse existing edges and nodes before adding new ones; respect `detailLevel`.
- Stable ids: reuse existing ids; new ids are kebab-case and descriptive (`refund-order`, `orders-api-to-stripe`).
- `npx archbook` and `archbook` are the same CLI; call `archbook` directly when the session says it is on PATH. Use Read, Glob and Grep for files.
- Subagents start with an empty context. Everything they need must be in the prompt you give them.

## Steps

1. If the flow description is empty, show the usage (`/archbook:add-flow <what happens, from trigger to outcome>`) and stop.
2. Read `archbook/architecture.json`. If it is missing, tell the user to run `/archbook:generate` first and stop. Read `archbook/config.json` for `audience`, `language`, `detailLevel` and `ignore`; without it, use the `audience` and `language` of the architecture file and `detailLevel: medium`.
3. Choose the flow id. If an existing flow is the same flow (same id, or a name and trigger that describe the same thing), reuse its id and update that flow. Otherwise derive a short kebab-case id from the description that no other flow uses.
4. Run `npx archbook snapshot --op add-flow`. If it fails, stop and report the error.
5. Launch `archbook:flow-tracer` with the Agent tool. Its prompt: the flow description verbatim, the flow id, `audience`, `language`, `detailLevel`, `ignore`, every node (id, kind, name, group, source paths), every edge (id, from, to, kind, label, source paths), and the existing flow object when you are updating one. It returns `{ flow, newEdges, newNodes, notes }`.
6. If the tracer could not find the flow in the code, report that with its notes and stop without editing.
7. Merge through the CLI, which leaves the rest of the file as it is:
   - Edit the tracer's output before you write it: keep a `newNodes` entry only if a step needs it and no existing node is the same component (otherwise point its `newEdges` at the existing node id), and set each new node's `group` to the most fitting existing group.
   - Write it to `archbook/.drafts/flow-<flow id>.json` and run `npx archbook merge --draft archbook/.drafts/flow-<flow id>.json`. The merge adds nodes whose id is new, reuses an existing edge with the same `from`, `to` and `kind`, gives a clashing edge id a numeric suffix, points the steps at the result, and replaces the flow with the same id or appends it.
   - Its JSON report lists what was `added`, `reused`, `renamed` and `replaced`. When `written` is `false`, the result failed the schema and nothing changed: fix the draft and run the command again.
8. Launch `archbook:writer`. Its prompt: `audience`, `language`, `detailLevel`, the flow id, the ids of the nodes and edges the merge added, and the tracer's notes, with the instruction to touch nothing else.
9. Launch `archbook:validator`, then run `npx archbook validate` yourself as the final check.

## Report

The flow id and name, whether it was added or updated, the number of steps, the edges and nodes added (ids), tracer notes the user should check, warnings left, and how to continue: `npx archbook dev` to replay it, `npx archbook undo` to revert.
