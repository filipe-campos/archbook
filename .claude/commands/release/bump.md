---
description: Bump the Archbook version everywhere it must move together, and optionally the schema version
argument-hint: "<new version, e.g. 0.2.0> [--schema <x.y>]"
---

# Bump the version

Arguments: `$ARGUMENTS`

If the version is missing or is not semver, ask and stop.

## Package version

These must always match (`describe("versions")` in `packages/cli/test/assets.test.ts`, and "Versions move together" in `docs/decisions.md`):

- `packages/cli/package.json`
- `packages/schema/package.json`
- `packages/viewer/package.json`
- `plugin/.claude-plugin/plugin.json`

Search the repo for the old version (`git grep -n "<old version>"`, excluding `pnpm-lock.yaml`) and update every other place that refers to the current release, such as the unpkg URLs built from the CLI version in docs.

## Schema version (only with `--schema`)

`SCHEMA_VERSION` in `packages/schema/src/architecture.ts` is versioned separately and drives the `version` literal and the `$schema` URLs. Changing it breaks every existing `architecture.json` and `config.json`, so confirm with the user first. Then update the example, the test fixtures, `docs/schema.md`, the `schema` skill and the plugin commands until `packages/schema/test/contract-docs.test.ts` passes, and record the change in `docs/decisions.md` under "Schema".

## Finish

Run `/dev:check full`. Report the files changed and suggest a commit message (`Release <version>`). Do not commit, tag or publish; `/release:publish` does that.
