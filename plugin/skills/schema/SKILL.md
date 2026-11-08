---
name: schema
description: Specification of archbook/architecture.json (Archbook schema 0.1) and how to model a codebase with it. Covers every field, kebab-case id rules and stability across regenerations, choosing node kinds and edge kinds, edge direction and labels, detail levels, groups, flows with async and reverse steps, payloads taken from real types, durationMs values, source references, validation codes, good vs bad examples and a pre-write checklist. Use whenever you create, update, review or repair archbook/architecture.json, or when `archbook validate` reports errors or warnings.
---

# Archbook `architecture.json`

`archbook/architecture.json` describes a system as **nodes** (components), **edges** (how they talk), **groups** (boxes around nodes) and **flows** (step-by-step journeys over edges). A React Flow viewer renders it and replays flows. It must be **true to the code**: every node and edge is backed by code you have read, cited in `sources`.

- The project root is the directory that contains `archbook/`. Source paths are relative to it.
- Find components with `archbook:detection-recipes`. Write prose (summaries, descriptions, titles) following `archbook:writing-guide`.
- Validate after every write: `npx archbook validate --json`. Fix every error; fix every warning unless you can justify it.

## Document shape

`?` marks an optional field, `= x` its default. **Every object is strict: unknown keys are errors**, so spell fields exactly as below.

```ts
{
  $schema?: "https://unpkg.com/archbook@0.1/schema/architecture.schema.json", // always include
  version: "0.1",
  project: { name: string, description?: string = "", repoUrl?: URL, defaultBranch?: string = "main" },
  audience?: "developers" | "stakeholders" | "mixed" = "developers",
  language?: string = "en",          // language tag of all prose, e.g. "en", "pt-BR"
  groups?: Group[] = [],
  nodes: Node[],                     // required, even if empty
  edges: Edge[],                     // required, even if empty
  flows?: Flow[] = [],
  generatedAt?: string,              // ISO 8601 with Z or offset: "2026-11-08T10:00:00Z"
  generatedBy?: string,              // e.g. "archbook@0.1.0 + claude-code"
}
Group     { id, name, description?, parent?: GroupId }
Node      { id, kind: NodeKind, name, summary, description?, tech?: string[] = [], group?: GroupId,
            sources?: SourceRef[] = [], owner?: string, links?: Link[] = [], position?: Position }
Edge      { id, from: NodeId, to: NodeId, kind: EdgeKind, label?, description?, sources?: SourceRef[] = [] }
Flow      { id, name, summary, trigger, steps: Step[] /* at least 1 */ }
Step      { edge: EdgeId, title, description?, payload?: any JSON, durationMs?: number /* > 0 */,
            async?: boolean = false, reverse?: boolean = false }
SourceRef { path, symbol?, lines?: [start, end] /* integers >= 1, start <= end, files only */ }
Link      { label, url /* absolute URL */ }
Position  { x: number, y: number }   // px, relative to the parent group when the node has one
NodeKind  = "app" | "service" | "worker" | "database" | "cache" | "queue" | "storage" | "external" | "actor"
EdgeKind  = "http" | "grpc" | "event" | "queue" | "db" | "cache" | "storage" | "websocket" | "other"
```

Field rules:

- `summary` (node, flow): one sentence on responsibility or outcome. `description`: Markdown for what the summary cannot hold (invariants, state machines, retries, idempotency, why).
- `name`: display name in Title Case, e.g. `Orders API`, `Payments Queue`, `Stripe`.
- `tech`: 1 to 5 entries, most significant first: runtime or product, framework, key libraries. Versions only when pinned in code or config (`PostgreSQL 16` from `image: postgres:16`).
- `owner`: only when the repo states it (CODEOWNERS, package metadata, README). Never guess.
- `links`: only URLs found in the repo or official public pages of a provider. Never invent internal URLs.
- `position`: never add one. When regenerating, keep any existing `position` (a human pinned it).
- `project.repoUrl`: from `git remote get-url origin`, as an https URL without `.git` (`git@github.com:acme/shop.git` becomes `https://github.com/acme/shop`). `defaultBranch` from `git symbolic-ref refs/remotes/origin/HEAD` when available.
- `language` and `audience`: copy from `archbook/config.json`. Write all prose in that language; ids, `tech` and code identifiers stay as they are.

## Ids

- Pattern `^[a-z0-9]+(?:-[a-z0-9]+)*$`: lowercase letters and digits, single hyphens. Unique within each collection.
- Derive ids from the real name of the thing: package or folder name, compose service name, queue or topic name, provider name. `orders-api`, `payment-worker`, `postgres`, `stripe`. Never `service-1` or `node-a`.
- Channel nodes get a suffix so they do not clash with their consumers: `payments-queue`, `order-events-topic`, `orders-stream`.
- Edges: `<from>-to-<to>`, e.g. `orders-api-to-postgres`. A second edge between the same pair adds a qualifier: `web-app-to-orders-api-ws`.
- Groups: the boundary they draw: `aws`, `vercel`, `backend`, `data`, `billing`. Flows: the journey: `checkout`, `stripe-webhook`, `user-signup`.
- **Stable across regenerations.** Before writing, read the existing `architecture.json` and reuse every id whose component still exists, even if you would name it differently today. History diffs, `archbook undo` and manual positions are keyed by id. If a component is renamed in code, keep the id and update `name`. Remove an id only when the thing is gone from the code.

## Node kinds

| Kind       | Use for                                                                                                  |
| ---------- | -------------------------------------------------------------------------------------------------------- |
| `app`      | Software people use: web frontend, mobile, desktop, CLI. A Next.js app is an `app` even with API routes. |
| `service`  | Deployable that serves requests: REST, GraphQL, gRPC, BFF, serverless HTTP functions, gateways.          |
| `worker`   | Deployable that works in the background: queue or stream consumer, scheduled job, cron.                  |
| `database` | Durable system of record: Postgres, MySQL, MongoDB, DynamoDB, Elasticsearch.                             |
| `cache`    | Short-lived data: cache, sessions, idempotency keys, rate limits, locks (Redis, Memcached).              |
| `queue`    | One named channel: job queue, topic or stream (BullMQ queue, SQS queue, SNS topic, Kafka topic).         |
| `storage`  | Files and blobs: S3 or GCS bucket, shared volume.                                                        |
| `external` | Outside this codebase: SaaS APIs, partner APIs, another team's service this repo only calls.             |
| `actor`    | A person or outside party that starts flows: Customer, Admin, Support agent.                             |

Decision rules:

- One process type that is deployed and scaled on its own is one node. Two entry points in one package with separate start commands (API and worker) are two nodes.
- A Redis instance used for caching is one `cache` node. Each queue or stream on it is its own `queue` node; do not draw edges from queues to Redis, say "backed by Redis" in `tech` and description.
- A message channel is its own `queue` node by default. A lightweight channel with exactly one producer and one consumer and nothing to document may instead be a direct `event` edge from producer to consumer, naming the channel in the description.
- `external` and `actor` nodes need no `sources`; cite the client code on their edges instead.

## Edge kinds and direction

| Kind        | Use for                                                                                                               |
| ----------- | --------------------------------------------------------------------------------------------------------------------- |
| `http`      | REST, GraphQL, inbound webhooks, SDKs that wrap an HTTP API (Stripe, Postmark, OpenAI).                               |
| `grpc`      | gRPC.                                                                                                                 |
| `event`     | Publish/subscribe where the producer does not know the consumers: Kafka, SNS, EventBridge, Redis pub/sub and streams. |
| `queue`     | Point-to-point jobs: BullMQ, SQS, RabbitMQ work queues, Celery, Sidekiq.                                              |
| `db`        | Any read or write to a `database`.                                                                                    |
| `cache`     | Any read or write to a `cache`.                                                                                       |
| `storage`   | Upload or download to `storage`.                                                                                      |
| `websocket` | WebSocket or Socket.IO connections.                                                                                   |
| `other`     | Email to a person, SMTP, SFTP, manual hand-off.                                                                       |

- Direction is who starts the interaction: caller to callee; webhook provider to receiver; producer to queue and **queue to consumer** (even though consumers poll); client to `database`, `cache` or `storage` (reads included).
- **No response edges.** A response is a flow step with `reverse: true` on the request edge.
- **One edge per pair and kind.** Several routes between the same two nodes share one edge: label it with the main route or the resource (`/orders/*`) and list routes in `description`. Several queries to the same database share one edge. Add a second edge only when the kind differs, or at `detailed` level when flows must show distinct operations.
- Labels are short and concrete: `POST /orders` (HTTP), `GetOrder` (gRPC), `order.created` (event), `payment.process` (job name), `orders` (main table for `db`), `SET NX` or `session:*` (cache), `PUT invoices/*` (storage), `consume` (queue to consumer).

## Detail level

Read `detailLevel` from `archbook/config.json` (default `medium`).

- **`high-level`**: systems only. Each product or bounded context is one node (usually `service` or `app`) with its private data stores folded in; shared data stores, external systems and actors stay. Typically 3 to 10 nodes.
- **`medium`**: one node per deployable (app, service, worker), per data store, per message channel, per external system, plus the actors that start flows. Routers, controllers, modules and libraries are `sources`, never nodes. Typically 5 to 30 nodes.
- **`detailed`**: like `medium`, but a deployable with clear internal modules (NestJS modules, packages of a modular monolith) becomes a group with the deployable's id, and each main module becomes a node of the deployable's kind with id `<deployable>-<module>`. Edges then attach to the module that sends or handles the interaction.

## Groups

- Use one axis per document: deployment boundaries (cloud account or region, cluster, hosting provider) when the repo shows them (IaC, `vercel.json`, deploy config), otherwise bounded contexts or teams.
- Nest with `parent` at most two or three levels. Skip groups for a handful of nodes or when there is no evidence of a boundary.
- Leave `external` and `actor` nodes out of groups.

## Sources

- Every path must be one you saw with Glob, Grep or Read in this session. Never build a path from framework conventions.
- Take line numbers from Read output. Cite the narrowest range that proves the claim: route registration plus handler, the client call, the consumer setup, the compose service block.
- Add `symbol` when a named function, class or export holds the code (`placeOrder`, `OrdersController`).
- Nodes: 1 to 3 sources (entry point, main definition such as a Prisma schema or compose service). Edges: the caller side, plus the receiving side when it is in this repo.
- Directory paths are allowed (`services/orders-api`), without `lines`. Never cite `node_modules`, build output, generated clients or lockfiles.

## Flows

- Document the flows listed in `archbook/config.json` `flows`, then the obvious main journeys (the core user action, inbound webhooks, scheduled jobs). Usually 2 to 6 flows of 3 to 12 steps.
- `trigger` is concrete: `Customer clicks "Pay" on the checkout page`, `Stripe sends payment_intent.succeeded`, `Every day at 02:00 UTC (cron 0 2 * * *)`.
- Each step traverses one existing edge. Steps are in the order a reader should see them happen.
- **`async: true`** when the sender does not wait: enqueue, publish, a consumer picking up a job or event, a provider delivering a webhook, an email reaching a person. HTTP, gRPC, `db` and `cache` calls are synchronous.
- **`reverse: true`** for a response that matters: a status that drives behaviour (`202` vs `409`), a returned id or token, the `200` that stops a provider from retrying. Do not add a reverse step after every call; a synchronous call returns implicitly.
- **Continuity** (`discontinuous-flow` warning): every non-async step must start at a node that an earlier step reached (either end). The first step and async steps may start anywhere. If a step starts somewhere unreached, a step is missing, the order is wrong, or the step is really async.
- A flow that crosses an async boundary and continues much later (webhook arrives, nightly job) is often better split into two flows.

### Payloads

- Build every payload from a real type you read: DTO class, zod or JSON schema, TypeScript interface or generic (`Queue<PaymentJob>`), Prisma model or entity, protobuf message, OpenAPI spec, event type definition. Include only fields that exist in that type; trim to the fields that matter (at most about 15).
- Use realistic values and keep them consistent across the flow (`ord_42` everywhere). Use provider id formats (`pi_...`, `evt_...`), enum values from the code (`PENDING_PAYMENT`) and units from the code (amounts in cents if the code uses cents).
- Never put secrets, tokens, real emails or real personal data in payloads. Use `example.com` addresses and obviously fake ids.
- Conventional shapes (payload is free JSON, but be consistent):

| Step                      | Shape                                                                   |
| ------------------------- | ----------------------------------------------------------------------- |
| HTTP request              | `{ "method", "path", "headers"? (only meaningful ones), "body" }`       |
| HTTP response (`reverse`) | `{ "status", "body"? }`                                                 |
| Inbound webhook           | the event body as received, e.g. `{ "id", "type", "data" }`             |
| Database                  | `{ "table", "where"?, plus "insert", "update", "select" or "include" }` |
| Cache                     | `{ "command", "key", "args" }`                                          |
| Enqueue job               | `{ "name", "data", "opts"? }`                                           |
| Consume job               | `{ "jobId", "name", "attemptsMade" }` or the message as received        |
| Publish event             | `{ "topic" or "stream", "key"?, "value" or "fields" }`                  |
| Third-party SDK call      | the HTTP request it makes, or the SDK arguments                         |

### `durationMs`

Rough, round, typical values. They pace the replay; they are not SLAs. Do not use timeouts (they are upper bounds).

| Interaction                       | `durationMs`  |
| --------------------------------- | ------------- |
| Cache command                     | 1 to 5        |
| Enqueue or publish                | 2 to 20       |
| Database query or write           | 5 to 30       |
| Internal HTTP or gRPC call        | 20 to 150     |
| Queue pickup, consumer lag        | 100 to 1000   |
| Third-party API, webhook delivery | 200 to 2000   |
| User action in a UI               | 300 to 2000   |
| Email or SMS reaching a person    | about 2000    |
| LLM call                          | 1000 to 20000 |

## Updating an existing document

1. Read the current `archbook/architecture.json` first, if there is one.
2. Keep ids, `position`, `owner`, `links` and hand-written descriptions of components that still exist, unless the code now contradicts them.
3. Add what is new, update what changed, remove what no longer exists in code. Re-check line ranges of every source you keep: code moves.
4. Validate, then summarise what you added, changed and removed.

## Validation codes

| Code                   | Level   | Typical cause and fix                                                                                                                           |
| ---------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `invalid-json`         | error   | Trailing comma, comment, unescaped quote or newline. Fix the syntax.                                                                            |
| `schema`               | error   | Missing field, unknown key (typo), bad id, bad enum, `start > end`, `durationMs <= 0`, wrong `version`, empty `steps`. Fix the field at `path`. |
| `duplicate-id`         | error   | Same id twice in a collection. Merge or rename.                                                                                                 |
| `unknown-node`         | error   | Edge `from`/`to` is not a node id. Use the suggested id or add the node.                                                                        |
| `unknown-group`        | error   | `group` or `parent` is not a group id.                                                                                                          |
| `group-cycle`          | error   | Group parents loop. Make the nesting a tree.                                                                                                    |
| `unknown-edge`         | error   | Step `edge` is not an edge id. Fix the id, or add the edge only if the code proves it.                                                          |
| `invalid-source-path`  | error   | Absolute path, backslashes, or `..` leaving the root. Use a root-relative path.                                                                 |
| `source-not-found`     | error   | Path does not exist. Find the real path with Glob; never guess.                                                                                 |
| `lines-out-of-range`   | error   | Range past end of file, or `lines` on a directory. Re-read the file.                                                                            |
| `isolated-node`        | warning | Node without edges. Add the edge the code shows, or drop the node.                                                                              |
| `node-without-sources` | warning | Non-external, non-actor node without sources. Cite its entry point or definition.                                                               |
| `discontinuous-flow`   | warning | Non-async step starts at an unreached node. Add the missing step, reorder, use `reverse`, or mark it `async`.                                   |

## Good vs bad

**Summary.** Bad: `"Handles orders."`, `"The backend."`, `"This service is responsible for various order-related operations."` Good: `"Express service that owns orders: creates them, queues payments and handles Stripe webhooks."` (what it is, what it owns, what it does).

**Invented source path.** Bad: `{ "path": "src/services/order.service.ts", "lines": [1, 120] }`, guessed from NestJS conventions; it does not exist (`source-not-found`) and the range was never read. Good: `{ "path": "services/orders-api/src/routes/orders.ts", "symbol": "ordersRouter", "lines": [8, 27] }`, found with Glob and read before citing.

**Node per file at `medium`.** Bad: nodes `orders-router`, `stripe-webhook-router`, `idempotency-lib`, `prisma-client`. Good: one `orders-api` node of kind `service` whose `sources` cite those files.

**Duplicate edges.** Bad:

```json
{ "id": "orders-api-to-postgres", "from": "orders-api", "to": "postgres", "kind": "db", "label": "insert order" },
{ "id": "orders-api-to-postgres-update", "from": "orders-api", "to": "postgres", "kind": "db", "label": "update order" }
```

Good: one `orders-api-to-postgres` edge labelled `orders`, citing both call sites. Flow steps say which operation happens (`"title": "Order marked CONFIRMED"`) and show it in `payload`.

**Response edge.** Bad: an extra edge `orders-api-to-web-app` used for the `202` response. Good: a step on `web-app-to-orders-api` with `"reverse": true` and `"payload": { "status": 202, "body": { "orderId": "ord_42" } }`.

**Step on a non-existent edge.** Bad: `{ "edge": "payment-worker-to-orders-api", "title": "Worker tells the API the payment succeeded" }`. The code shows no such call (`unknown-edge`); the worker writes Postgres, and Stripe calls the API's webhook later. Good: follow the real path. The checkout flow ends at `payment-worker-to-stripe`; a separate `stripe-webhook` flow starts with an async step on `stripe-to-orders-api`. Never add an edge only to make a flow connect.

**Consumer direction.** Bad: `payment-worker-to-payments-queue` labelled `consume`. Good: `payments-queue-to-payment-worker`, kind `queue`, labelled `consume`.

**Invented payload.** Bad: `{ "userId": "u1", "items": [], "card": "4242 4242 4242 4242" }` for a job whose type is `PaymentJob { orderId, amount, currency, paymentMethodId }`. Good: `{ "name": "payment.process", "data": { "orderId": "ord_42", "amount": 5998, "currency": "usd", "paymentMethodId": "pm_1Q2w3E4r" } }`.

**Unstable ids.** Bad: the existing file has `orders-api`; the regeneration writes `order-service` for the same Express app. History shows a removal plus an addition and the pinned position is lost. Good: keep `orders-api`, update `name` or `summary` if needed.

**Broken continuity.** Bad: steps `web-app-to-orders-api`, then `payments-queue-to-payment-worker` without `async`, so the queue was never reached. Good: add `orders-api-to-payments-queue` (async) before it, and mark the consume step async.

## Pre-write checklist

- [ ] `$schema` and `"version": "0.1"` are present; `project`, `nodes` and `edges` exist.
- [ ] No unknown keys anywhere (`summary`, `durationMs`, `repoUrl`, `defaultBranch` spelled exactly).
- [ ] Every id is kebab-case, unique in its collection, and reused from the existing file where the component still exists.
- [ ] Node kinds and the number of nodes match the configured `detailLevel`; no node per file, router or library at `medium`.
- [ ] Every edge `from`/`to` is a node id, every `group`/`parent` is a group id, every step `edge` is an edge id.
- [ ] Edge direction follows the rules (queue to consumer, client to store, provider to webhook receiver); no response edges; no duplicate edges for the same pair and kind.
- [ ] Every source path was seen in this session, is root-relative with forward slashes, and its `lines` come from Read output.
- [ ] Every node except `external` and `actor` has sources; every node has at least one edge.
- [ ] Every flow has a concrete trigger; non-async steps start at reached nodes; `async` and `reverse` are used as defined above.
- [ ] Payloads come from real types, use consistent fake values and contain no secrets or personal data.
- [ ] Existing `position`, `owner` and `links` are preserved; no invented owners or URLs.
- [ ] Prose is in the configured `language` and follows `archbook:writing-guide`.
- [ ] `npx archbook validate --json` reports no errors, and every remaining warning is deliberate.
