# `architecture.json` reference

Archbook describes a system in one JSON file, `archbook/architecture.json`. It lists the components of the system (**nodes**), how they talk to each other (**edges**), optional boxes around them (**groups**) and step-by-step walkthroughs of important journeys (**flows**). The viewer renders the file as an interactive diagram and replays flows step by step.

The file is usually written by Claude Code through the commands Archbook installs, but it is plain JSON: you can read it, review it in pull requests and edit it by hand. Every claim in it should be traceable to code through `sources`.

This page documents schema version `0.1`. A complete, valid document lives in [`examples/shop-checkout/archbook/architecture.json`](../examples/shop-checkout/archbook/architecture.json); most examples below come from it.

## Files and project root

| Path                         | Contents                                                                |
| ---------------------------- | ----------------------------------------------------------------------- |
| `archbook/architecture.json` | The architecture document described on this page.                       |
| `archbook/config.json`       | Generation settings. See [`archbook/config.json`](#archbookconfigjson). |
| `archbook/.history/`         | Snapshots used by `archbook history` and `archbook undo`.               |

The **project root** is the directory that contains the `archbook/` folder. Every source path in the document is relative to it.

## Editor autocomplete

Start the file with a `$schema` key:

```json
{
  "$schema": "https://unpkg.com/archbook@0.1/schema/architecture.schema.json",
  "version": "0.1"
}
```

The JSON Schema (draft-07) is generated from the same Zod schema that the CLI uses, so editors such as VS Code and JetBrains IDEs offer completions, show field descriptions and flag type errors while you type. Rules that span several objects (references between ids, source paths on disk, flow continuity) are only checked by [`archbook validate`](#validation).

## Minimal example

The smallest useful document: three nodes, two edges, no groups and no flows. It is valid with no warnings.

```json
{
  "$schema": "https://unpkg.com/archbook@0.1/schema/architecture.schema.json",
  "version": "0.1",
  "project": {
    "name": "Todo",
    "description": "A todo list app with a React frontend and a REST API."
  },
  "nodes": [
    {
      "id": "web-app",
      "kind": "app",
      "name": "Web App",
      "summary": "React single-page app where users manage their todo lists.",
      "sources": [{ "path": "web/src/main.tsx" }]
    },
    {
      "id": "todo-api",
      "kind": "service",
      "name": "Todo API",
      "summary": "Fastify service that stores and serves todo lists.",
      "sources": [{ "path": "api/src/server.ts" }]
    },
    {
      "id": "postgres",
      "kind": "database",
      "name": "Postgres",
      "summary": "Stores users, lists and todo items.",
      "sources": [{ "path": "api/prisma/schema.prisma" }]
    }
  ],
  "edges": [
    {
      "id": "web-app-to-todo-api",
      "from": "web-app",
      "to": "todo-api",
      "kind": "http",
      "label": "REST /todos"
    },
    {
      "id": "todo-api-to-postgres",
      "from": "todo-api",
      "to": "postgres",
      "kind": "db",
      "label": "todos"
    }
  ]
}
```

## Conventions

### Ids

Nodes, edges, groups and flows each have an `id`. Ids must be **kebab-case**: lowercase letters and digits separated by single hyphens (`^[a-z0-9]+(?:-[a-z0-9]+)*$`). `orders-api` and `s3-uploads` are valid; `Orders_API`, `orders--api` and `-orders` are not.

- Ids are unique within their collection: two nodes cannot share an id, but a node and a flow can.
- Ids are references. Edges point to nodes by id, steps to edges, nodes and groups to groups.
- Keep ids **stable** across regenerations. History diffs, manual `position` overrides and links into the viewer all rely on them. Renaming a component's display `name` does not require a new id.
- Edge ids follow `<from>-to-<to>`, for example `orders-api-to-postgres`. When two edges join the same pair of nodes, add a suffix that tells them apart: `web-app-to-orders-api-ws`.

### Strict objects

Every object is strict: a key that the schema does not define is a `schema` error. This catches typos such as `sumary` or `duration_ms` that would otherwise be silently ignored.

### Defaults

Optional fields with a default (for example `tech`, `sources` and `flows`) can be omitted. The tables below list each default.

### Prose fields

`description` fields accept Markdown. `summary`, `title`, `trigger`, `name` and `label` are plain text. All prose is written in the document's `language` for its `audience`.

## Top-level object

| Field         | Type                       | Required / default     | Description                                                                                            |
| ------------- | -------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------ |
| `$schema`     | string                     | optional               | URL of the JSON Schema, for editor autocomplete. Not used by Archbook.                                 |
| `version`     | string                     | required               | Schema version. Must be `"0.1"`.                                                                       |
| `project`     | [project](#project)        | required               | Name, description and repository of the system.                                                        |
| `audience`    | string                     | default `"developers"` | Who the prose is written for: `developers`, `stakeholders` or `mixed`.                                 |
| `language`    | string                     | default `"en"`         | Language of all written content, as a BCP 47 language tag such as `en` or `pt-BR`.                     |
| `groups`      | array of [groups](#groups) | default `[]`           | Boxes drawn around nodes: deployment targets, network zones, bounded contexts.                         |
| `nodes`       | array of [nodes](#nodes)   | required               | Components of the system.                                                                              |
| `edges`       | array of [edges](#edges)   | required               | Connections between nodes.                                                                             |
| `flows`       | array of [flows](#flows)   | default `[]`           | Step-by-step journeys through the edges.                                                               |
| `generatedAt` | string                     | optional               | When the file was generated: an ISO 8601 date-time with `Z` or an offset, e.g. `2026-11-08T10:00:00Z`. |
| `generatedBy` | string                     | optional               | What wrote the file, e.g. `archbook@0.1.0 + claude-code`.                                              |

`$schema`, `generatedAt` and `generatedBy` change on every regeneration, so history diffs ignore them.

## `project`

| Field           | Type   | Required / default | Description                                                                                                                                         |
| --------------- | ------ | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`          | string | required           | Display name of the system.                                                                                                                         |
| `description`   | string | default `""`       | One or two sentences on what the system does.                                                                                                       |
| `repoUrl`       | URL    | optional           | Repository URL, e.g. `https://github.com/acme/shop`. Used to link source references to the hosted files. Must be an absolute `http` or `https` URL. |
| `defaultBranch` | string | default `"main"`   | Branch used in those links.                                                                                                                         |

```json
"project": {
  "name": "Shop Checkout",
  "description": "A small e-commerce backend: a Next.js storefront, an Express orders API, BullMQ workers for payments and Redis Streams for notifications.",
  "repoUrl": "https://github.com/acme/shop-checkout",
  "defaultBranch": "main"
}
```

## `groups`

| Field         | Type     | Required / default | Description                                                                  |
| ------------- | -------- | ------------------ | ---------------------------------------------------------------------------- |
| `id`          | id       | required           | Kebab-case group id.                                                         |
| `name`        | string   | required           | Display name, e.g. `AWS us-east-1`, `Backend services`, `Billing context`.   |
| `description` | string   | optional           | Markdown.                                                                    |
| `parent`      | group id | optional           | Enclosing group, for nesting. Must exist, and parents must not form a cycle. |

Use groups for one kind of boundary per document: where things are deployed (cloud account, region, cluster, hosting provider), network zones, or bounded contexts and teams. Nodes reference their group with `group`; a node without one is drawn at the top level. External systems and actors usually have no group.

```json
"groups": [
  { "id": "aws", "name": "AWS us-east-1", "description": "Containers on ECS plus managed data stores." },
  { "id": "backend", "name": "Backend services", "parent": "aws" },
  { "id": "data", "name": "Data stores", "parent": "aws" }
]
```

## `nodes`

| Field         | Type                                       | Required / default | Description                                                                              |
| ------------- | ------------------------------------------ | ------------------ | ---------------------------------------------------------------------------------------- |
| `id`          | id                                         | required           | Kebab-case node id.                                                                      |
| `kind`        | [node kind](#node-kinds)                   | required           | What sort of component this is.                                                          |
| `name`        | string                                     | required           | Display name, e.g. `Orders API`.                                                         |
| `summary`     | string                                     | required           | One sentence: what the component is responsible for.                                     |
| `description` | string                                     | optional           | Markdown. What the summary cannot hold: invariants, state machines, retries, trade-offs. |
| `tech`        | array of strings                           | default `[]`       | Main technologies, most significant first, e.g. `["Node.js", "Express", "Prisma"]`.      |
| `group`       | group id                                   | optional           | Group that contains the node.                                                            |
| `sources`     | array of [source refs](#source-references) | default `[]`       | Code or configuration that defines the node.                                             |
| `owner`       | string                                     | optional           | Owning team or person, e.g. `checkout-team`.                                             |
| `links`       | array of [links](#links)                   | default `[]`       | Related documentation, dashboards or runbooks.                                           |
| `position`    | [position](#position)                      | optional           | Manual layout override.                                                                  |

```json
{
  "id": "payment-worker",
  "kind": "worker",
  "name": "Payment Worker",
  "summary": "Consumes payment jobs and creates Stripe PaymentIntents.",
  "description": "Runs up to 10 jobs concurrently. Uses `order-<id>` as the Stripe idempotency key, so a retried job never charges twice.",
  "tech": ["Node.js", "BullMQ", "Stripe SDK"],
  "group": "backend",
  "owner": "checkout-team",
  "sources": [{ "path": "workers/payment-worker/src/index.ts", "lines": [8, 28] }]
}
```

### Node kinds

| Kind       | Use for                                                                                                                                   | Examples                                                             |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `app`      | Software people use directly: web frontends, mobile and desktop apps, CLIs. A Next.js app stays an `app` even though it runs server code. | Next.js storefront, React Native app, admin SPA                      |
| `service`  | A deployable that serves requests: REST, GraphQL or gRPC APIs, backends for frontends, serverless functions, API gateways.                | Express orders API, NestJS GraphQL server, Lambda behind API Gateway |
| `worker`   | A deployable that works in the background instead of serving requests: queue consumers, stream processors, scheduled jobs.                | BullMQ worker, Kafka consumer, nightly report cron                   |
| `database` | A system of record that holds durable data: relational, document, key-value or search stores.                                             | Postgres, MongoDB, DynamoDB, Elasticsearch                           |
| `cache`    | A fast store for short-lived data: caching, sessions, idempotency keys, rate limits, locks.                                               | Redis, Memcached                                                     |
| `queue`    | A message channel: a job queue, topic or stream. One node per named channel.                                                              | BullMQ `payments` queue, SQS queue, SNS topic, Kafka topic           |
| `storage`  | Files and blobs: object storage buckets and shared filesystems.                                                                           | S3 bucket, GCS bucket, uploads volume                                |
| `external` | A system outside this codebase that it calls or that calls it.                                                                            | Stripe, Postmark, OpenAI, a partner API, another team's service      |
| `actor`    | A person or outside party that starts flows.                                                                                              | Customer, Admin, Support agent                                       |

At the default level of detail there is one node per deployable (app, service, worker), per data store, per message channel and per external system, plus the actors that start flows. Routers, controllers, modules and libraries are not nodes; cite them as `sources` of the node that runs them.

## `edges`

| Field         | Type                                       | Required / default | Description                                                            |
| ------------- | ------------------------------------------ | ------------------ | ---------------------------------------------------------------------- |
| `id`          | id                                         | required           | Kebab-case edge id, conventionally `<from>-to-<to>`.                   |
| `from`        | node id                                    | required           | Node that starts the interaction.                                      |
| `to`          | node id                                    | required           | Node that receives it.                                                 |
| `kind`        | [edge kind](#edge-kinds)                   | required           | How the two nodes communicate.                                         |
| `label`       | string                                     | optional           | Short label drawn on the edge, e.g. `POST /orders` or `order.created`. |
| `description` | string                                     | optional           | Markdown explanation of the interaction.                               |
| `sources`     | array of [source refs](#source-references) | default `[]`       | Code that makes or receives the call.                                  |

```json
{
  "id": "orders-api-to-payments-queue",
  "from": "orders-api",
  "to": "payments-queue",
  "kind": "queue",
  "label": "payment.process",
  "sources": [{ "path": "services/orders-api/src/routes/orders.ts", "lines": [19, 24] }]
}
```

### Edge kinds

| Kind        | Use for                                                                                                                             |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `http`      | HTTP requests: REST, GraphQL, inbound webhooks, and SDKs that wrap an HTTP API (Stripe, Postmark).                                  |
| `grpc`      | gRPC calls.                                                                                                                         |
| `event`     | Publish/subscribe: the producer emits an event without knowing who consumes it. Kafka, SNS, EventBridge, Redis pub/sub and streams. |
| `queue`     | Point-to-point work: enqueueing a job and consuming it. BullMQ, SQS, RabbitMQ work queues, Celery, Sidekiq.                         |
| `db`        | Reads and writes to a `database` node.                                                                                              |
| `cache`     | Reads and writes to a `cache` node.                                                                                                 |
| `storage`   | Uploads and downloads to a `storage` node.                                                                                          |
| `websocket` | Long-lived bidirectional connections: WebSocket, Socket.IO.                                                                         |
| `other`     | Anything else, e.g. an email delivered to a person, SMTP, SFTP, a manual hand-off.                                                  |

### Direction

An edge points from the side that starts the interaction to the side that receives it:

- Caller to callee for HTTP and gRPC. A webhook goes from the provider to the receiver (`stripe-to-orders-api`).
- Producer to queue, then queue to consumer (`orders-api-to-payments-queue`, `payments-queue-to-payment-worker`), even though the consumer polls.
- Client to store for `db`, `cache` and `storage` edges, reads included.

Responses are not separate edges. A flow step with `reverse: true` travels an edge backwards (see [flow steps](#flow-steps)).

Keep one edge per pair of nodes and kind. When a service calls several routes of another, use one edge, label it with the main route or the resource (`/orders/*`) and list the routes in the description. Add a second edge between the same pair only when the kind differs or when flows need to show distinct interactions.

## `flows`

| Field     | Type                          | Required / default   | Description                                                              |
| --------- | ----------------------------- | -------------------- | ------------------------------------------------------------------------ |
| `id`      | id                            | required             | Kebab-case flow id, e.g. `checkout`.                                     |
| `name`    | string                        | required             | Display name, e.g. `Checkout`.                                           |
| `summary` | string                        | required             | One or two sentences: what the flow achieves.                            |
| `trigger` | string                        | required             | What starts the flow, e.g. `Customer clicks "Pay" on the checkout page`. |
| `steps`   | array of [steps](#flow-steps) | required, at least 1 | Steps in the order they happen.                                          |

```json
{
  "id": "order-confirmation-email",
  "name": "Order confirmation email",
  "summary": "The notifications worker turns order.confirmed into a templated email for the customer.",
  "trigger": "An order.confirmed event lands on the events:orders stream",
  "steps": [
    {
      "edge": "orders-api-to-notifications-worker",
      "title": "Worker reads order.confirmed",
      "async": true
    },
    { "edge": "notifications-worker-to-postgres", "title": "Worker loads the order and its items" },
    {
      "edge": "notifications-worker-to-email-service",
      "title": "Email sent with the order-confirmed template"
    },
    {
      "edge": "email-service-to-customer",
      "title": "Customer receives the confirmation",
      "async": true
    }
  ]
}
```

## Flow steps

| Field         | Type     | Required / default | Description                                                                            |
| ------------- | -------- | ------------------ | -------------------------------------------------------------------------------------- |
| `edge`        | edge id  | required           | Edge traversed in this step.                                                           |
| `title`       | string   | required           | What happens, e.g. `Payment job enqueued`.                                             |
| `description` | string   | optional           | Markdown explanation of the step.                                                      |
| `payload`     | any JSON | optional           | Example of the data carried in this step: a request, a row, a job, an event.           |
| `durationMs`  | number   | optional           | Typical duration in milliseconds, greater than 0. Paces the replay animation.          |
| `async`       | boolean  | default `false`    | The step does not block the previous one: enqueueing, publishing, consuming, webhooks. |
| `reverse`     | boolean  | default `false`    | The step travels the edge from `to` back to `from`, e.g. an HTTP response.             |

```json
{
  "edge": "web-app-to-orders-api",
  "title": "API answers 202 Accepted",
  "description": "The web app redirects to the order page, which polls `GET /orders/:id` until the status changes.",
  "payload": { "status": 202, "body": { "orderId": "ord_42", "status": "PENDING_PAYMENT" } },
  "durationMs": 20,
  "reverse": true
}
```

### `async` and `reverse`

- **`async: true`** marks a step whose sender does not wait for it: enqueueing a job, publishing an event, a worker picking a job up later, a provider delivering a webhook, an email reaching a person. Calls where the caller waits for an answer (HTTP, gRPC, database and cache operations) stay synchronous.
- **`reverse: true`** shows a response on the same edge, so the document does not need a second edge in the opposite direction. Use it when the response carries something the reader needs, such as the `202 Accepted` above or the `200` that stops Stripe from retrying a webhook. A synchronous call returns to its caller implicitly, so most calls need no reverse step.

### Flow continuity

Each step that is not `async` must start at a node the flow has already reached, meaning either end of any earlier step. Because a synchronous call returns to its caller, after `web-app -> orders-api` and `orders-api -> postgres` the next step may start at `web-app`, `orders-api` or `postgres`. The first step may start anywhere, and `async` steps may start anywhere because they happen independently. A step that breaks this rule raises the [`discontinuous-flow`](#warnings) warning.

## Source references

| Field    | Type           | Required / default | Description                                                                          |
| -------- | -------------- | ------------------ | ------------------------------------------------------------------------------------ |
| `path`   | string         | required           | File or directory, relative to the project root, with forward slashes.               |
| `symbol` | string         | optional           | Function, class or export name in the file, e.g. `placeOrder`.                       |
| `lines`  | `[start, end]` | optional           | Inclusive, 1-based line range with `start <= end`. Only valid when `path` is a file. |

```json
"sources": [
  { "path": "services/orders-api/src/routes/orders.ts", "symbol": "ordersRouter", "lines": [8, 27] },
  { "path": "docker-compose.yml", "lines": [33, 38] },
  { "path": "services/orders-api" }
]
```

Path rules:

- Relative to the project root. Absolute paths (`/srv/app/server.ts`, `C:/repo/server.ts`) are rejected.
- Forward slashes only, also on Windows.
- `./` and `..` segments are normalized, but a path cannot leave the project root.
- The file or directory must exist, and `lines` must fall inside the file.

Point at the narrowest code that proves the claim: the route registration, the client call, the consumer setup, the service block in `docker-compose.yml`. Nodes of kind `external` and `actor` usually have no sources, because they are not defined in the codebase.

## Links

| Field   | Type   | Required / default | Description                                                                                        |
| ------- | ------ | ------------------ | -------------------------------------------------------------------------------------------------- |
| `label` | string | required           | Link text, e.g. `Stripe dashboard`.                                                                |
| `url`   | URL    | required           | Absolute `http` or `https` URL. Other schemes (`javascript:`, `data:`, `file:`) are schema errors. |

```json
"links": [{ "label": "Stripe dashboard", "url": "https://dashboard.stripe.com" }]
```

## Position

| Field | Type   | Required / default | Description            |
| ----- | ------ | ------------------ | ---------------------- |
| `x`   | number | required           | Horizontal offset, px. |
| `y`   | number | required           | Vertical offset, px.   |

`position` pins a node by hand. Coordinates are in pixels, relative to the parent group when the node has a `group` and to the canvas otherwise. Leave it out to let the viewer lay the node out automatically. Regenerations keep existing positions as long as the node id stays the same.

```json
"position": { "x": 40, "y": 120 }
```

## Validation

```sh
npx archbook validate          # human-readable report
npx archbook validate --json   # machine-readable output, for scripts and agents
```

`archbook validate` parses the file, checks it against the schema, resolves every reference and checks every source path against the project on disk. **Errors** make the document invalid. **Warnings** flag likely mistakes; a document with warnings is still valid. Each issue has a code, a message and a path that locates it, such as `nodes[2].sources[0].path`. Messages about unknown ids suggest the closest existing id when there is one.

### Errors

| Code                  | Triggered when                                                                                                                                                                                                                                                                          | How to fix                                                                                                 |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `invalid-json`        | The file is not valid JSON: trailing commas, comments, unescaped quotes or raw line breaks inside strings.                                                                                                                                                                              | Fix the syntax at the position in the message. JSON has no comments; move notes into `description` fields. |
| `schema`              | The document does not match the schema: a missing required field, a wrong type, an unknown key, an unknown `kind`, an id that is not kebab-case, `lines` with `start > end`, a `version` other than `"0.1"`, a flow with no steps, a `durationMs` of 0 or less, an invalid URL or date. | Read the message and path. For unknown keys, check the spelling against the tables above.                  |
| `duplicate-id`        | Two items in the same collection share an id.                                                                                                                                                                                                                                           | Merge the duplicates if they describe the same thing, otherwise rename one and update its references.      |
| `unknown-node`        | An edge's `from` or `to` is not a node id.                                                                                                                                                                                                                                              | Fix the typo (see the suggestion) or add the missing node.                                                 |
| `unknown-group`       | A node's `group` or a group's `parent` is not a group id.                                                                                                                                                                                                                               | Fix the typo or add the missing group.                                                                     |
| `group-cycle`         | Group parents form a loop, e.g. `a` inside `b` inside `a`. Each group in the loop is reported.                                                                                                                                                                                          | Remove one `parent` so the nesting becomes a tree.                                                         |
| `unknown-edge`        | A flow step's `edge` is not an edge id.                                                                                                                                                                                                                                                 | Fix the typo, or add the edge if the code really has that interaction.                                     |
| `invalid-source-path` | A source path is absolute, uses backslashes, or climbs out of the project root with `..`.                                                                                                                                                                                               | Write the path relative to the project root with forward slashes.                                          |
| `source-not-found`    | A source path does not exist under the project root.                                                                                                                                                                                                                                    | Correct the path, or remove the reference if the code was moved or deleted.                                |
| `lines-out-of-range`  | A line range ends past the last line of the file, or a directory has a line range.                                                                                                                                                                                                      | Re-read the file and update the range, or drop `lines` for directories.                                    |

### Warnings

| Code                   | Triggered when                                                                        | How to fix                                                                                                                           |
| ---------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `isolated-node`        | A node has no edges.                                                                  | Add the edge the code shows, or remove the node if nothing talks to it.                                                              |
| `node-without-sources` | A node has no `sources`. Not raised for `external` and `actor` nodes.                 | Point to the code or configuration that defines the node: its entry point, its schema, its `docker-compose.yml` service.             |
| `discontinuous-flow`   | A step that is not `async` starts at a node that no earlier step in the flow reached. | Add the missing step, fix the step order, use `reverse` for a response, or mark the step `async` if it really happens independently. |

## `archbook/config.json`

`archbook/config.json` holds the settings that guide generation. It is created when Archbook is set up in a project and is read every time the architecture is generated or updated. Its JSON Schema is at `https://unpkg.com/archbook@0.1/schema/config.schema.json`. Objects are strict here too.

| Field                   | Type             | Required / default                                            | Description                                                                                                                |
| ----------------------- | ---------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `$schema`               | string           | optional                                                      | JSON Schema URL, for editor autocomplete.                                                                                  |
| `version`               | string           | required                                                      | Must be `"0.1"`.                                                                                                           |
| `project.name`          | string           | required                                                      | Copied into `architecture.json`.                                                                                           |
| `project.description`   | string           | default `""`                                                  | Copied into `architecture.json`.                                                                                           |
| `project.repoUrl`       | URL              | optional                                                      | Absolute `http` or `https` URL. Copied into `architecture.json`.                                                           |
| `project.defaultBranch` | string           | default `"main"`                                              | Copied into `architecture.json`.                                                                                           |
| `audience`              | string           | default `"developers"`                                        | `developers`, `stakeholders` or `mixed`.                                                                                   |
| `language`              | string           | default `"en"`                                                | Language of the generated prose, as a BCP 47 language tag such as `en` or `pt-BR`.                                         |
| `detailLevel`           | string           | default `"medium"`                                            | `high-level`: systems only. `medium`: services, data stores and queues. `detailed`: also the main modules inside services. |
| `flows`                 | array of strings | default `[]`                                                  | The most important flows to document, in plain language, e.g. `"Checkout from cart to confirmed payment"`.                 |
| `externalContext`       | string           | optional                                                      | External systems or infrastructure that do not appear in the code, e.g. which managed services run in production.          |
| `ignore`                | array of strings | default `["node_modules", "dist", "build", ".git", "vendor"]` | Paths skipped when scanning the codebase.                                                                                  |
| `detected`              | array            | default `[]`                                                  | What a scan found: `{ "name": "Docker Compose", "files": ["docker-compose.yml"] }`. `files` defaults to `[]`.              |
| `history.limit`         | integer          | default `20`                                                  | How many snapshots of `architecture.json` to keep in `archbook/.history/`, from 1 to 1000.                                 |

```json
{
  "$schema": "https://unpkg.com/archbook@0.1/schema/config.schema.json",
  "version": "0.1",
  "project": { "name": "Shop Checkout", "repoUrl": "https://github.com/acme/shop-checkout" },
  "audience": "developers",
  "detailLevel": "medium",
  "flows": ["Checkout from cart to confirmed payment", "Order confirmation email"],
  "externalContext": "Production runs on AWS ECS. Postgres is RDS and Redis is ElastiCache.",
  "detected": [{ "name": "Docker Compose", "files": ["docker-compose.yml"] }]
}
```

## History and undo

Archbook keeps snapshots of `architecture.json` in `archbook/.history/`, up to `history.limit`. `archbook history` lists them with a one-line summary of each change, such as `+2 nodes, -1 flow, 3 nodes changed`, and `archbook undo` restores the previous snapshot. Changes are matched by id, which is one more reason to keep ids stable.
