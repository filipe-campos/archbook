---
detect:
  - name: BullMQ
    packages: [bullmq, bull]
---

# BullMQ (and Bull)

Detects Redis-backed job queues built with BullMQ or Bull. Produces one `queue` node per queue name, `worker` nodes for the processes that consume them, and `queue` edges. Celery, Sidekiq, RQ and asynq follow the same modelling.

## Signals

- **Dependencies**: `"(bullmq|bull|@nestjs/bullmq|@nestjs/bull|bee-queue)"\s*:` in glob `**/package.json`.
- **Queues** (producer side), in JS/TS files: `new Queue(<[^>]*>)?\(` (the first argument is the queue name); NestJS `BullModule\.registerQueue\(` and `@InjectQueue\(\s*["']`.
- **Queue name constants**: `[A-Z_]*QUEUE[A-Z_]*\s*=\s*["']`.
- **Jobs added**: `\.(add|addBulk)\(\s*["'\w]` on a queue variable; `new FlowProducer\(` for job trees.
- **Workers** (consumer side): `new Worker(<[^>]*>)?\(`; NestJS `@Processor\(\s*["']` with `extends WorkerHost`, or `@Process\(` (Bull); Bull v3 `\.process\(`.
- **Schedules**: `repeat:\s*\{`, `upsertJobScheduler\(`, `pattern:\s*["']` (cron), `every:\s*\d`.
- **Listeners**: `new QueueEvents\(`, `\.on\(\s*["'](completed|failed|progress|stalled)["']`, `@OnWorkerEvent\(`.
- **Connection**: `connection:\s*\{` near `REDIS_URL` or `REDIS_HOST`.
- **Other languages**: Celery `@(app\.task|shared_task)` and `\.(delay|apply_async)\(`; Sidekiq `include Sidekiq::(Job|Worker)` and `perform_async`; RQ `\.enqueue\(`; Go asynq `asynq\.NewTask\(` and `HandleFunc\(`; Laravel `implements ShouldQueue` and `dispatch\(`.

## Nodes

- One `queue` node per queue name (first argument of `new Queue` and `new Worker`). Id `<name>-queue` (`payments` gives `payments-queue`), name `Payments Queue`, `tech` `["BullMQ", "Redis"]`. Description: the job names it carries, default job options (`attempts`, `backoff`, `removeOnComplete`, `removeOnFail`), rate limits and priorities.
- One `worker` node per deployable that runs `new Worker` or `@Processor` (own package, start command or compose service). Put `concurrency` in its description.
- A worker started inside the API process (same entry point) is not a separate node: the consumer edge goes to the `service` node.
- Redis itself: no edges from queues to Redis. If the same Redis is also used directly (cache, locks), it has a `cache` node (see `redis.md`) whose description says it backs the queues.

## Edges

- **Producer to queue**: kind `queue`, from the node that calls `.add`, labelled with the job name (`payment.process`), or the queue name when job names vary.
- **Queue to consumer**: kind `queue`, labelled `consume` or with the job names handled.
- What the processor does (database writes, HTTP calls, new jobs) becomes edges from the worker node, found with the other recipes.
- **Repeatable jobs**: the node that registers the schedule gets the producer edge; the flow trigger names the schedule.
- **`QueueEvents` listeners** in another node: `event` edge from the queue to the listener, labelled with the event (`completed`, `failed`).
- **FlowProducer**: one producer edge per child queue.

## Sources to cite

- Queue node: the `new Queue(` call with its options, or `BullModule.registerQueue`.
- Producer edge: the `.add(` call.
- Consumer edge: the `new Worker(` or `@Processor` lines through the processor function.
- Worker node: the worker entry file, including the `concurrency` option.

## Flow hints

- Enqueue step: `async: true`, payload `{ "name", "data", "opts"? }`. Take `data` from the job type: the generic in `new Queue<PaymentJob>`, `Job<PaymentJob>`, or the object passed to `.add`.
- Consume step: `async: true`, payload `{ "jobId", "name", "attemptsMade" }`, `durationMs` 100 to 1000.
- Then follow the processor body. A processor that switches on `job.name` handles several jobs; trace only the branch of the flow's job.
- Retries come from `attempts` and `backoff` in `defaultJobOptions` or the `.add` options. A failing job is retried, then kept in the failed set unless `removeOnFail`. Mention it in the step description when reliability matters to the flow.
- A processor that adds jobs to another queue continues the flow with more async steps.

## Pitfalls

- Producer and worker usually live in different packages: match them by the queue name string or a shared constant, not by variable names.
- `job.name` is the job name, not the queue name; one queue can carry several job names.
- The `prefix` option changes Redis keys, not the logical queue.
- Bull v3 consumes with `queue.process(...)`; BullMQ uses a separate `Worker`. `QueueScheduler` (old BullMQ) is infrastructure, not a consumer.
- Dashboards (`@bull-board/*`, `arena`) are not nodes.
