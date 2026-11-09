# Changelog

All notable changes to Archbook are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-11-09

### Added

- The `archbook` CLI: `init`, `generate`, `dev`, `build`, `validate`, `format`, `history`, `undo` and `remove`.
- The `architecture.json` schema, with a JSON Schema for editor autocomplete and validation of every cited file and
  line range.
- The viewer: a navigable diagram of components and connections, a details panel linked to the code, search, and
  replayable flows with shareable links to each step.
- Claude Code commands, agents and skills to generate the docs, add a flow, sync with code changes and explain a
  component, installable by `archbook init` or as a plugin from this repository.
- Detection recipes that teach the agents and `archbook init` to recognize frameworks, queues and data stores.
- Snapshots before every AI change, with `archbook history` and `archbook undo`.
- A premium look for the viewer: glass surfaces, an accent gradient, bundled Inter and JetBrains Mono fonts, glowing
  replay of the active step, a replay button on the canvas and a floating timeline.
- Generation phases and a summary card in `archbook generate`, and a tidier `archbook init`.
- The `curator` agent, which polishes names, labels, tech chips and step titles so generated docs read as one product.
- Community files: code of conduct, security policy, issue forms, pull request template and funding links.

[Unreleased]: https://github.com/filipe-campos/archbook/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/filipe-campos/archbook/releases/tag/v0.1.0
