---
description: Rewrite one node's description in archbook/architecture.json in depth, based on its source code
argument-hint: <node-id>
allowed-tools: Read, Glob, Grep, Skill, Edit(./archbook/architecture.json), Bash(archbook validate *), Bash(archbook snapshot *), Bash(archbook --version *), Bash(npx archbook validate *), Bash(npx archbook snapshot *), Bash(npx archbook --version *)
---

# Explain one node in depth

Node id: $ARGUMENTS

Rewrite the `description` of this node so a reader understands how it really works. Only this node changes.

## Ground rules

- Only edit `archbook/architecture.json`, and in it only this node's `description` and `sources`. Never project source code, and never `generatedAt`, which `/archbook:sync` uses as its baseline.
- Never cite or describe a file you have not opened. Describe only what the code shows.
- Keep the node id unchanged.
- `npx archbook` and `archbook` are the same CLI; call `archbook` directly when the session says it is on PATH. Use Read, Glob and Grep for files.

## Steps

1. Read `archbook/architecture.json`. If it is missing, tell the user to run `/archbook:generate` and stop. Read `archbook/config.json` for `audience`, `language` and `detailLevel`; without it, use the `audience` and `language` of the architecture file.
2. Find the node whose `id` equals the argument. If the argument is empty or matches no node, list up to five close ids (similar spelling, or a name containing the words given) with their names, and stop.
3. Gather evidence. Start from the node's `sources`; for `external` and `actor` nodes, start from the sources of the edges that touch it. Follow the code they lead to: entrypoints, handlers and the modules they call, ORM models or migrations for the data it owns, retry and error handling, configuration and environment variables. Read the edges that touch the node to learn who calls it and what it calls. Open specific files, not whole folders, and stop once you can fill the outline below.
4. Load the `archbook:writing-guide` skill. Write the new `description` in `language` for `audience`, with a `###` heading (translated into `language`) for each section the code supports, skipping the rest:
   - **Responsibilities**: what it does, and what it deliberately leaves to other nodes.
   - **Key code paths**: the main entrypoints and what happens in each, with file and symbol names.
   - **Data owned**: tables, collections, keys, buckets or queues it writes, and who else reads them.
   - **Failure modes and retries**: timeouts, retries, idempotency, dead letters, and what breaks downstream when it fails.
   - **Configuration**: environment variables, flags, concurrency and scaling settings.

   For `stakeholders`, phrase the same sections in business terms as the guide describes. Stay under about 400 words.

5. Run `npx archbook snapshot --op explain`. If it fails, stop and report the error.
6. Edit the node in place: replace its `description`, or add one right after `summary`. You may append `sources` entries for files you opened that implement what the description says (`symbol` when useful, `lines` only for ranges you read). Keep the JSON valid: line breaks as `\n`, double quotes escaped.
7. Run `npx archbook validate`. Fix any error your edit caused. Report other errors without touching them and suggest `/archbook:sync`.

## Report

The node id, the sections written, the sources added, and `npx archbook undo` to revert.
