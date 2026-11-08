---
description: Run the same checks CI runs (lint, format, build, typecheck, coverage, example validation) and report what failed
argument-hint: "[quick | full]"
---

# Run the repository checks

Mode: `$ARGUMENTS` (empty means the default set).

- `quick`: only `pnpm lint`, `pnpm typecheck` and `pnpm test`, for a fast loop while editing.
- empty: the CI job "checks".
- `full`: the default set plus `pnpm test:e2e` and the plugin manifest validation.

## Default set

Run in this order and stop at the first failing step, since later steps depend on the build:

```sh
pnpm lint
pnpm format:check
pnpm build
pnpm typecheck
pnpm test:coverage
node packages/cli/dist/index.js validate --cwd examples/shop-checkout
node packages/cli/dist/index.js format --check --cwd examples/shop-checkout
```

## Extra steps for `full`

```sh
pnpm test:e2e   # if Chromium is missing: pnpm exec playwright install chromium
claude plugin validate plugin
claude plugin validate .
```

## When something fails

- `format:check`: run `pnpm format` and say which files changed.
- Coverage below the limit: add tests. Never lower the thresholds in `vitest.config.ts`.
- Lint errors about imports are layer boundaries; read the `dev-cli` or `dev-viewer` skill before moving code around.
- Anything else: show the relevant error lines and the likely cause. Do not fix unless the user asked for it.

## Report

Start with pass or fail, then one line per step with its result. Keep logs out of the answer unless a step failed.
