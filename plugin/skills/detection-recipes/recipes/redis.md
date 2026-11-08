# Redis

Detects Redis (and compatible stores such as Valkey, KeyDB, Upstash and ElastiCache) and tells apart its four uses: cache, job queue, pub/sub and stream. Produces a `cache` node per instance plus `queue` nodes for queues and streams, with `cache`, `queue` or `event` edges depending on the use.

## Signals

- **Dependencies**: `"(ioredis|redis|@redis/client|@upstash/redis|@vercel/kv|cache-manager|@nestjs/cache-manager|cache-manager-redis-store|@keyv/redis|connect-redis|rate-limit-redis|redlock|@socket\.io/redis-adapter)"\s*:` in glob `**/package.json`.
- **Clients**, in JS/TS files: `new (Redis|IORedis)\(`, `createClient\(`, `createCluster\(`, `Redis\.fromEnv\(`.
- **Env vars**: `\b(REDIS_URL|REDIS_HOST|UPSTASH_REDIS_REST_URL|KV_URL)\b`.
- **Usage**, case-insensitive (`-i: true`, because node-redis uses camelCase such as `setEx` and `xAdd`):
  - Cache and key-value: `\.(get|set|setex|psetex|getex|mget|mset|del|expire|incr|incrby|hget|hset|hgetall|sadd|zadd)\(`
  - Pub/sub: `\.(publish|subscribe|psubscribe|ssubscribe)\(`
  - Streams: `\.(xadd|xread|xreadgroup|xack|xgroup|xclaim|xautoclaim|xrange)\(`
  - List queues: `\.(lpush|rpush|brpop|blpop|blmove|brpoplpush)\(`
- **Key prefixes**: read the key strings next to the calls. Prefixes such as `idem:`, `session:`, `rl:`, `lock:` and `cache:` reveal the purpose.
- **Other languages**: Python `redis` (`redis\.Redis\(`, `from_url\(`); Go `github\.com/redis/go-redis`; Ruby `Redis\.new`; Java `jedis|lettuce|spring-data-redis`.

### Telling the uses apart

| Use                                                         | Code signals                                                                                                                                | Model as                                                                                                                               |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Cache, key-value, idempotency keys, locks, sessions, limits | `get` and `set` with `EX`, `PX` or `NX`, `setex`, `incr`, `expire`, `hset`; `cache-manager`, `connect-redis`, `redlock`, `rate-limit-redis` | One `cache` node per instance, a `cache` edge from each client.                                                                        |
| Job queue                                                   | BullMQ or Bull; lists used as queues (`lpush` with `brpop`)                                                                                 | A `queue` node per queue and `queue` edges, see `bullmq.md`.                                                                           |
| Pub/sub                                                     | `publish`, `subscribe`, `psubscribe`                                                                                                        | An `event` edge from publisher to subscriber per channel; a `queue` node per channel when there are several publishers or subscribers. |
| Stream                                                      | `xadd`, `xreadgroup`, `xack`, `xgroup`                                                                                                      | A `queue` node per stream with `event` edges; or a direct `event` edge when there is one producer and one consumer.                    |

## Nodes

- One `cache` node per Redis instance (distinct URL or env var) that has any cache-type use. Id `redis`, or `<purpose>-redis` when there are several (`sessions-redis`). `tech`: `["Redis 7", "ioredis"]`, plus the managed product (`ElastiCache`, `Upstash`) when known. Description: what it stores by key prefix, TTLs, and which queues and streams it also backs.
- Each stream that gets its own node: kind `queue`, id `<stream>-stream` (`events:orders` gives `events-orders-stream`), `tech` `["Redis Streams"]`, consumer groups in the description.
- Redis used only as a BullMQ backend: no Redis node; mention Redis in the queue nodes' `tech`.
- Socket.IO Redis adapter: mention it in the service description; no extra node or edge at `medium`.

## Edges

- **Cache**: `client -> redis`, kind `cache`, one edge per client node, labelled with the operation or purpose: `SET NX`, `GET/SET product:*`, `sessions`.
- **Pub/sub**: `publisher -> subscriber`, kind `event`, labelled with the channel; or through a channel `queue` node.
- **Streams**: producer to stream node (`event`, labelled with the event type) and stream node to consumer (`event`, labelled with the consumer group or event types). With one producer and one consumer, a direct `event` edge from producer to consumer, labelled with the event type, is enough; name the stream and the consumer group in its description.

## Sources to cite

- Instance node: the client construction (`new Redis(process.env.REDIS_URL)`) and the compose service or IaC resource.
- Cache edge: the call site, for example the `SET ... NX` line in an idempotency helper.
- Stream and pub/sub edges: the `xadd` or `publish` line on the producer side and the `xreadgroup` or `subscribe` lines on the consumer side.

## Flow hints

- Cache step payload: the command as sent, `{ "command": "SET", "key": "idem:6b1f...", "args": ["1", "EX", 86400, "NX"] }`. `durationMs` 1 to 5.
- Cache-aside reads (`GET` miss, database query, `SET`): show the miss path only when the flow is about it.
- Idempotency keys and locks (`SET NX`) decide whether the flow continues: describe both outcomes in the step description.
- Stream publish payload `{ "stream", "fields" }`; consume payload `{ "id", ...fields }`. Both steps are `async: true`.
- Pub/sub delivery is async and messages are lost when no subscriber is connected; streams persist and support consumer groups and acknowledgements. Say which one when reliability matters.

## Pitfalls

- One instance used for many purposes is still one `cache` node. Logical database numbers (`redis://host:6379/1`) on the same instance are not separate nodes.
- `.get(` and `.set(` also match maps, config objects, Express and HTTP clients: confirm the receiver is a Redis client.
- `cache-manager` may use an in-memory store: check the configured store before adding Redis.
- Upstash `@upstash/redis` talks HTTP but is still Redis: edge kind `cache`, not `http`.
- Do not add a cache edge for the connection that BullMQ opens.
