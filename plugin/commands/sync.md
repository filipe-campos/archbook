---
description: Update archbook/architecture.json to match code changes since it was generated, keeping ids stable
allowed-tools: Read, Glob, Grep, Skill, Agent, Edit(./archbook/architecture.json), Edit(./archbook/.drafts/**), Bash(archbook validate *), Bash(archbook snapshot *), Bash(archbook merge *), Bash(archbook format *), Bash(npx archbook validate *), Bash(npx archbook snapshot *), Bash(npx archbook merge *), Bash(npx archbook format *), Bash(git log *), Bash(git diff *), Bash(git status *)
---

# Sync the architecture document with the code

Update `archbook/architecture.json` for what changed in the code since it was generated. This is an incremental edit: keep ids stable, touch only affected elements, never regenerate the whole file.

## Ground rules

- Only edit `archbook/architecture.json` and the drafts in `archbook/.drafts/`; never project source code.
- Never cite a file nobody opened or listed. `lines` only for ranges someone read.
- Prefer fewer, well-explained nodes over many shallow ones; respect `detailLevel`.
- Stable ids: reuse existing ids; new ids are kebab-case and descriptive (`billing-api`, `billing-api-to-postgres`).
- `npx archbook` and `archbook` are the same CLI; call `archbook` directly when the session says it is on PATH. Use Read, Glob and Grep for files; in the shell, run only the CLI and the `git` commands below.
- Subagents start with an empty context. Everything they need must be in the prompt you give them.

## 1. Load

Read `archbook/config.json` and `archbook/architecture.json`. If the architecture file is missing, tell the user to run `/archbook:generate` and stop. The **config brief** for subagents: project name and description, `audience`, `language`, `detailLevel`, `ignore`, `externalContext`.

## 2. Find what changed

1. Baseline: `generatedAt`. If it is missing, use `git log -1 --format=%cI -- archbook/architecture.json`.
2. Committed changes: `git log --since=<baseline> --name-status --oneline`. Uncommitted and untracked files: `git status --porcelain`.
3. Ignore `archbook/`, paths in `ignore`, lockfiles, and tests or docs that do not define behavior.
4. To see how a file changed: `git log --since=<baseline> -p -- <path>`, and `git diff HEAD -- <path>` for uncommitted edits. Read the current file when the diff is not enough.
5. Without git (the commands fail or this is not a repository), launch `archbook:scanner` with the config brief and the current groups, nodes and edges, and compare its draft with the file instead.

## 3. Map changes to the document

An element is affected when one of its `sources` paths equals a changed file or is a directory that contains it.

- **Renamed or moved file**: update the source path and re-check `lines`.
- **Deleted file**: remove that source. If a node or edge loses all its sources and Grep finds no replacement, propose removing it, together with its edges and the flow steps that use them.
- **Modified file**: re-read the cited `lines` and correct the ranges. If behavior changed (route, queue or topic, table, external call, payload fields, retries), propose updating the affected text, edges or payloads.
- **Changes no source covers**: look for new components or connections: manifests, Dockerfiles or compose services, entrypoints, routes, consumers, queues, SDK clients for third-party systems. When you find one, launch `archbook:scanner` with the config brief, the existing groups, nodes and edges (so it reuses ids) and the changed paths as focus paths.
- **Flows** that use an affected edge and whose code path changed: re-trace them with `archbook:flow-tracer` instead of patching steps by hand. Its prompt: a description built from the flow's name, trigger and summary, the flow id, the config brief, the current nodes and edges, and the existing flow object.

## 4. Confirm

Build the change list grouped as **Add**, **Update** and **Remove**. Each item names the element id, the change and the evidence (file and what it shows). If the list is empty, say the document is up to date and stop without editing.

- Interactive session: show the list and ask the user to confirm all, some or none. Wait for the answer before editing.
- Non-interactive run (no user can answer, for example when the `archbook` CLI or CI runs `claude -p`): apply only items backed by concrete evidence in code you opened, such as renames, deletions, corrected ranges, or components defined in a manifest, infrastructure file or entrypoint. List the rest as not applied.

## 5. Apply

1. Run `npx archbook snapshot --op sync`. If it fails, stop and report the error. Keep the values of the `Time: <ISO 8601 UTC>` and `Generated-By: <value>` lines it prints.
2. Apply the approved updates and removals with targeted Edit calls. Approved additions from scanner or tracer output go through the CLI: write a draft with only those elements to `archbook/.drafts/<name>.json` (`{ groups, nodes, edges }` for the scanner, the tracer's `{ flow, newEdges, newNodes }` as is) and run `npx archbook merge --draft archbook/.drafts/<name>.json`. It adds only ids that are new, reuses an existing edge with the same `from`, `to` and `kind`, points flow steps at the result and replaces a re-traced flow with the same id. When its report says `written: false`, fix the draft and run it again.
3. Set `generatedAt` to the `Time:` value and `generatedBy` to the `Generated-By:` value.
4. Launch `archbook:writer` for the added elements and those whose behavior changed. Its prompt: `audience`, `language`, `detailLevel`, their ids, and the evidence you collected for each.
5. Launch `archbook:curator` with `audience`, `language`, `detailLevel` and the same ids, plus the ids of their siblings (the other nodes in their groups, the other steps of their flows), so names, labels, tech chips and step titles stay consistent with the rest of the document.
6. Launch `archbook:validator`, then run `npx archbook validate` yourself as the final check.

## 6. Report

Applied changes (Add, Update, Remove, with ids), changes not applied and why, warnings left, and `npx archbook undo` to revert.
