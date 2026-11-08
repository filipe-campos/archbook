---
name: detection-recipes
description: "Recipes that map code patterns to Archbook nodes, edges and source references, one file per technology: HTTP servers (Express, Fastify, NestJS), Next.js, BullMQ, AWS SQS/SNS, Kafka, Prisma/TypeORM and other ORMs, Redis, Stripe and inbound webhooks, Docker Compose, outbound HTTP clients. Each recipe gives concrete Grep patterns for dependencies, imports, files and config keys, says what becomes a node or an edge (kind, id, label), which lines to cite and how to trace flows and payloads. Use when scanning a codebase to generate or update archbook/architecture.json. Detect the stack first, then read only the recipes that match it."
---

# Detection recipes

A recipe turns the code patterns of one technology into Archbook nodes, edges and `sources`. There is one recipe per file in [`recipes/`](recipes/). **Read only the recipes that match the detected stack**; most repositories need three to six. The output format, id rules and modelling rules are in `archbook:schema`.

Every recipe has the same sections:

- **Signals**: dependencies, imports, file names and config keys to look for, as Grep patterns.
- **Nodes**: what becomes a node, its kind, id, name and `tech`.
- **Edges**: what becomes an edge, its kind, direction and label format.
- **Sources to cite**: which files and lines prove each node and edge.
- **Flow hints**: how to trace a flow through the technology and where payloads come from.
- **Pitfalls**: common false positives and modelling mistakes.

## Workflow

1. **Detect the stack.** Read the manifests at the root and in every workspace package: `package.json` (dependencies, `workspaces`), `pnpm-workspace.yaml`, `turbo.json`, `nx.json`, `go.mod`, `pyproject.toml`, `requirements*.txt`, `Gemfile`, `pom.xml`, `build.gradle*`, `composer.json`, `Cargo.toml`. Glob for infrastructure: `**/{docker-compose,compose}*.{yml,yaml}`, `**/Dockerfile*`, `**/*.tf`, `**/serverless.{yml,yaml}`, `**/cdk.json`, `**/{k8s,kubernetes,helm,charts,deploy}/**/*.{yml,yaml}`, `**/vercel.json`, `**/fly.toml`, `**/render.yaml`, `**/Procfile`. If `archbook/config.json` has `detected` entries, start from them and verify them; an entry with a `recipe` names the recipe file that covers it.
2. **Pick recipes** from the index below and read each matching file, starting with the `recipe` files of the `detected` entries.
3. **Find the deployables first**: every package or folder with its own start command, Dockerfile, compose service or function definition. They are the nodes that everything else attaches to. `docker-compose.md` and the framework recipes do this.
4. **Run each recipe's Signals.** Grep with `output_mode: "files_with_matches"` first, read the files that matter, then apply the recipe's Nodes, Edges and Sources rules.
5. **Merge.** The same thing found by several recipes is one node: the `postgres` compose service and the Prisma datasource are one `database` node citing both. Match by hostname, env var, queue or topic name.
6. **Trace flows** with the Flow hints, starting from the entry points of the flows listed in `archbook/config.json`.
7. **Cover the rest** with the generic method below.

## Index

| Recipe                                                           | Read when the repo has                                                           | Produces                                                                      |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| [`express-fastify-nestjs.md`](recipes/express-fastify-nestjs.md) | `express`, `fastify`, `@nestjs/core`, `koa`, `hono`; FastAPI, Flask, Spring, Gin | `service` nodes, inbound `http` edges labelled with full routes               |
| [`nextjs.md`](recipes/nextjs.md)                                 | `next`, `next.config.*`, `app/**/route.ts`, `"use server"`                       | one `app` node per Next.js project, its server and browser calls              |
| [`bullmq.md`](recipes/bullmq.md)                                 | `bullmq`, `bull`, `@nestjs/bullmq`; Celery, Sidekiq, asynq                       | `queue` nodes per queue, `worker` nodes, `queue` edges                        |
| [`aws-sqs-sns.md`](recipes/aws-sqs-sns.md)                       | `@aws-sdk/client-sqs`, `@aws-sdk/client-sns`, `aws_sqs_queue`, `serverless.yml`  | `queue` nodes per queue and topic, `queue` and `event` edges                  |
| [`kafka.md`](recipes/kafka.md)                                   | `kafkajs`, `@confluentinc/kafka-javascript`, `@KafkaListener`, Kafka images      | `queue` nodes per topic, `event` edges                                        |
| [`prisma-typeorm.md`](recipes/prisma-typeorm.md)                 | `schema.prisma`, `typeorm`, `drizzle-orm`, `mongoose`, `sequelize`, `knex`, `pg` | `database` nodes per physical database, `db` edges                            |
| [`redis.md`](recipes/redis.md)                                   | `ioredis`, `redis`, `@upstash/redis`, `REDIS_URL`                                | `cache` node per instance; tells cache, queue, pub/sub and stream usage apart |
| [`stripe-webhooks.md`](recipes/stripe-webhooks.md)               | `stripe`, `constructEvent`, `/webhooks` routes, signature headers                | `external` provider nodes, outbound and inbound webhook `http` edges          |
| [`docker-compose.md`](recipes/docker-compose.md)                 | `docker-compose*.yml`, `compose*.yaml`                                           | deployables and infrastructure nodes, env-var evidence for edges              |
| [`http-clients.md`](recipes/http-clients.md)                     | `fetch(`, `axios`, `got`, `ky`, SDKs of third parties, `*_URL` env vars          | outbound `http` edges, `external` nodes, internal vs external targets         |

## Rules for every recipe

- **Evidence first.** A node or edge exists only when code or configuration proves it. A dependency in `package.json` alone proves nothing: find the call.
- **Skip non-production code**: the `ignore` paths in `archbook/config.json`, plus tests, mocks, fixtures, examples, Storybook and seed scripts (`**/{test,tests,__tests__,__mocks__,fixtures,e2e,cypress,playwright,stories}/**`, `*.{test,spec}.*`, `*.stories.*`).
- **Local stand-ins are not production nodes.** LocalStack, MinIO, MailHog, the Stripe CLI and ngrok stand in for real services: model the real service and cite both.
- **Resolve env vars** to know what a URL points to: `.env.example`, `.env.sample`, compose `environment:`, IaC, Kubernetes manifests, Helm values, config modules. Do not copy values that look like secrets.
- **Collect sources while you read**: note the path and line range of every match you use, so the final document cites exactly what you saw.

## Grep conventions

- Patterns are ripgrep regular expressions for the Grep tool. `(`, `.`, `{`, `[` and `$` are escaped when literal. There are no lookarounds.
- "JS/TS files" means glob `*.{ts,tsx,js,jsx,mjs,cjs}`. Grep skips `.gitignore`d paths such as `node_modules`.
- Where a recipe says case-insensitive, pass `-i: true`.
- Patterns are a starting point: read the matches, they include false positives that the Pitfalls sections describe.

## Generic method (no recipe matches)

1. **Entry points**: start scripts (`"start"`, `"dev"` in `package.json`), Dockerfile `CMD` and `ENTRYPOINT`, `main` functions, `Procfile`, exported platform handlers (Lambda `handler`, Cloud Functions).
2. **Outbound I/O**: clients created at module level (`new \w+Client\(`, `createClient\(`, `\.connect\(`) and env vars ending in `_URL`, `_URI`, `_HOST`, `_ENDPOINT`, `_DSN` or `_ARN`.
3. **Inbound I/O**: listeners (`\.listen\(`, `serve\(`), subscriptions, scheduled triggers (`cron`, `schedule`).
4. Map each to a node kind and edge kind with `archbook:schema`, and cite the lines.

## Contributing a recipe

Copy [`recipes/_template.md`](recipes/_template.md), keep its six sections and add a row to the index above. The `detect` frontmatter lists the npm packages that reveal the technology; `archbook init` reads it to fill `detected`.
