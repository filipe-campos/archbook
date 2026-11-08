# Archbook

pnpm monorepo: `packages/schema` (the `architecture.json` contract), `packages/viewer` (React Flow app), `packages/cli` (`archbook` on npm) and `plugin/` (the Claude Code plugin shipped to users). `CONTRIBUTING.md` is the source of truth for layout, layers, checks and conventions; `docs/decisions.md` records past choices. Read both before non-trivial changes.

- Load the matching skill before working in an area: `dev-schema`, `dev-cli`, `dev-viewer`, `dev-plugin`.
- Everything in English. No em dashes. Comments only for a non-obvious why.
- Record choices the docs do not cover in `docs/decisions.md`.
- Never lower coverage thresholds.
- Finish with `/dev:check` (or `/review:pre-pr` before a pull request).
- The tooling in this folder is listed in `.claude/README.md`.
