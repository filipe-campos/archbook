# <Technology name>

<!--
How to write a recipe:
- Copy this file to recipes/<technology>.md (kebab-case, e.g. rabbitmq.md) and add a row to the index in ../SKILL.md.
- Keep the six sections below, in this order, with these exact headings.
- Write for an agent that has never seen the repository: concrete patterns, concrete labels, concrete examples.
- Grep patterns are ripgrep regular expressions for the Grep tool: escape literal ( . { [ $, no lookarounds.
- Every rule must lead to a node, an edge, a source or a flow step, or prevent a wrong one.
- English only. No em-dashes. Aim for 45 to 80 lines; the existing recipes are good references.
- Delete this comment before submitting.
-->

One or two sentences: what this recipe detects and which node kinds and edge kinds it produces. Name close variants that follow the same rules (for example "Koa and Hono follow the Express rules").

## Signals

- **Dependencies**: `"(<package-a>|<package-b>)"\s*:` in glob `**/package.json`.
- **<Pattern group>**, in JS/TS files: `<ripgrep pattern>`, `<ripgrep pattern>`.
- **Configuration**: files to Glob (`**/<name>.{yml,yaml}`) and keys to grep (`^\s*<key>:`).
- **Infrastructure**: compose images, Terraform resources (`resource\s+"<type>"`), Kubernetes kinds.
- **Other languages**: one line per language with the library names and the main pattern.

## Nodes

- What becomes a node, its `kind`, how to derive its id (`<name>-queue`), `name` and `tech`.
- What does not become a node at `medium` (clients, helpers, modules), and what changes at `high-level` or `detailed`.
- What goes into the node description (retries, retention, limits, ownership).

## Edges

- Each interaction, with its direction (`from -> to`), `kind` and label format, e.g. `POST /orders`, `order.created`, `consume`.
- When several interactions share one edge, and when a second edge is justified.

## Sources to cite

- Node: which definition proves it (client construction, IaC resource, compose service block).
- Edge: which call site proves each side (producer call, consumer registration, route handler).

## Flow hints

- How to follow a flow through this technology: which steps are `async`, when a `reverse` step helps.
- Where payloads come from (types, schemas, generics, IDL files) and the payload shape to use.
- Typical `durationMs` values for its operations.

## Pitfalls

- False positives of the patterns above and how to rule them out.
- Local development stand-ins, test-only code and modelling mistakes specific to this technology.
