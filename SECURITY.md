# Security Policy

## Supported versions

Only the latest minor release of the `archbook` package on npm receives security fixes. Fixes ship as a new patch
release.

| Version        | Supported |
| -------------- | --------- |
| Latest minor   | Yes       |
| Older releases | No        |

## Reporting a vulnerability

**Please do not report security vulnerabilities through public issues, discussions or pull requests.**

Report it privately through one of these channels:

- **GitHub Security Advisories (preferred):** open the
  [Security tab](https://github.com/filipe-campos/archbook/security) of the repository and click
  **Report a vulnerability**.
- **Email:** [filipefcl@hotmail.com](mailto:filipefcl@hotmail.com), with `[Archbook security]` in the subject.

Please include:

- The Archbook version (`npx archbook --version`), Node.js version and operating system.
- A description of the issue and its impact.
- Steps to reproduce or a proof of concept (a sample `architecture.json`, repository or command is ideal).
- Any suggested fix or mitigation, if you have one.

## What to expect

- **Acknowledgement** within 3 business days.
- **Initial assessment** (confirmed or not, severity) within 7 days.
- **Fix** for confirmed issues as soon as possible, usually within 30 days depending on complexity. You will be kept
  informed of the progress.
- Once a fix is released, the advisory is published and you are credited, unless you prefer to remain anonymous.

Archbook is maintained by a single person, so please be patient. Coordinated disclosure is appreciated: give us a
reasonable chance to release a fix before going public.

## Scope

Archbook reads code, writes files into your project, runs Claude Code headless and serves a viewer for a JSON file that
an AI or a contributor may have written. The most relevant areas are:

- **The viewer and untrusted documents.** `architecture.json` is untrusted input. Anything in it (descriptions,
  Markdown, payloads, links, `project.repoUrl`) that leads to script execution, loads remote content or escapes the
  Content Security Policy of the built site is in scope.
- **`archbook dev`.** The dev server binds to `localhost` by default. Reading files outside the viewer and
  `architecture.json` (path traversal), or anything that lets another origin read the served document, is in scope.
- **Writes to your project.** `init`, `merge`, `format`, `undo` and `remove` must only touch the files they document.
  Writing or deleting outside the project, `remove` deleting files `init` did not install, or a draft path that escapes
  `archbook/.drafts/` are in scope.
- **Claude Code integration.** `archbook generate` runs Claude Code with an explicit list of allowed tools, and the
  plugin's commands declare their own `allowed-tools`. A way for repository content to make those sessions run tools
  outside that list, or to run shell commands the list does not allow, is in scope.
- **The npm package.** Anything that makes the published tarball run code on install, or ship files it should not.

Out of scope:

- Vulnerabilities in Claude Code itself, the Claude models or the Anthropic API (report them to Anthropic).
- What Claude Code writes inside the tools it is allowed to use, such as inaccurate or misleading documentation.
- Exposing `archbook dev` on purpose with `--host 0.0.0.0` on an untrusted network.
- Static sites built with `archbook build` and served by a host that drops or overrides the Content Security Policy.
- Issues that require an already compromised machine or physical access.
