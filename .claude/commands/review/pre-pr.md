---
description: Review the current branch before opening a pull request (conventions, contract sync, tests) and run the checks
argument-hint: "[base branch, default main]"
---

# Review before a pull request

Base: `$ARGUMENTS` (default `main`).

1. Collect the changes: `git diff <base>...HEAD`, `git diff`, `git diff --cached` and `git status --porcelain` (untracked files count). If there is nothing, say so and stop.
2. Launch in parallel, giving each the base branch and the list of changed files:
   - `conventions-reviewer`, always;
   - `contract-reviewer`, when anything changed in `packages/schema/`, `plugin/`, `packages/cli/src/io/claude.ts`, `packages/cli/src/core/{assets,recipes}.ts`, `docs/schema.md` or a version field.
3. While they run, execute `/dev:check`.
4. Merge the findings, drop duplicates and anything you cannot point to in the diff, and rank by severity.

Report: check results, then findings as `file:line`, problem, fix. End with a suggested commit message in English, imperative mood, without any trailer. Do not commit or push.
