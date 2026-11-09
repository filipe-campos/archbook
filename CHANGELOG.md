# Changelog

All notable changes to Archbook are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
- Community files: code of conduct, security policy, issue forms, pull request template and funding links.

[Unreleased]: https://github.com/filipe-campos/archbook/commits/main
