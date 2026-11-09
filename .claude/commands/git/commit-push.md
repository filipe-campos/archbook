---
description: Commit the current changes with a message in the repository's style and push them to GitHub
argument-hint: "[message or hint] [--no-check]"
---

# Commit and push

Arguments: `$ARGUMENTS`

## 1. Look at the changes

1. Run `git status --porcelain`, `git diff`, `git diff --cached` and `git log --format=%s -10`.
2. If there is nothing to commit and nothing to push, say so and stop.
3. Read untracked files before staging them. Never stage secrets (`.env*`, tokens, keys), build output or anything gitignored. If a file looks like it should not be committed, ask.
4. If the changes mix unrelated topics, propose how to split them into separate commits and ask before going on.

## 2. Check

Unless `--no-check` was passed, run `/dev:check quick` and `pnpm format:check`. If something fails, report it and stop; do not commit broken code. `pnpm format` may fix formatting, but say which files it changed.

## 3. Commit

- Stage files by name (`git add <files>`), not with `git add -A`.
- Message: the text in the arguments, if given, otherwise write one. Follow the style of `git log`: English, imperative mood, sentence case, no final period, one line that names what changed, joining related changes with commas. Add a body only when the reason is not obvious from the summary.
- No trailers and no attribution of any kind (no `Co-Authored-By`, no "Generated with" line, no mention of Claude or any AI tool).
- Pass the message with a heredoc so quoting cannot break it. Never use `--no-verify` or `--amend` unless the user asked.

## 4. Push

1. Push the current branch: `git push`, or `git push -u origin <branch>` when it has no upstream.
2. If the push is rejected because the remote moved, run `git pull --rebase` and push again. If the rebase has conflicts, stop and show them.
3. Never force push.

## 5. Report

The commit hash and message, the branch, and the push result. If the branch is not `main`, offer to open a pull request with `gh pr create`.
