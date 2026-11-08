# Docker Compose

Detects the deployables and infrastructure declared in Compose files. Produces nodes for services built from the repo and for infrastructure images, and gives env-var evidence for edges that the code recipes then confirm and label.

## Signals

- **Files**: Glob `**/{docker-compose,compose}*.{yml,yaml}`. Dockerfiles: Glob `**/Dockerfile*`, then `^(CMD|ENTRYPOINT)` inside them.
- **Service keys**, in compose files: `^\s+(image|build|depends_on|environment|env_file|ports|command|profiles|extends|deploy):`.
- **Infrastructure images**: `^\s+image:\s*["']?(postgres|mysql|mariadb|mongo|redis|valkey|memcached|rabbitmq|nats|minio|localstack|elasticsearch|opensearch|mailhog|mailpit|nginx|traefik|caddy)` and the Kafka images (`confluentinc/cp-kafka`, `bitnami/kafka`, `apache/kafka`, `redpandadata/redpanda`).
- **Connections between services**: URLs whose host is another compose service, `[a-z+]+://([^@/\s]+@)?[a-z0-9_-]+:\d+`, and host variables `_(HOST|URL|URI|ENDPOINT|ADDR|BROKERS)\s*[:=]`.
- **Other deployment files** (same modelling, read when present): Kubernetes `kind:\s*(Deployment|StatefulSet|CronJob|Service)`, Helm `values.yaml`, `fly.toml`, `render.yaml`, `Procfile`, `app.yaml`.

## Nodes

Each compose service maps to a node by what it runs:

| Compose service                                                                                                                               | Node                                                                                                  |
| --------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `build:` pointing into the repo                                                                                                               | `app`, `service` or `worker`: read the Dockerfile `CMD` and the entry point to decide                 |
| `postgres`, `mysql`, `mariadb`, `mongo`, `cockroachdb/cockroach`, `mcr.microsoft.com/mssql/server`                                            | `database`; `tech` from the tag (`postgres:16` gives `PostgreSQL 16`)                                 |
| `elasticsearch`, `opensearchproject/opensearch`                                                                                               | `database` (search index)                                                                             |
| `redis`, `valkey/valkey`, `eqalpha/keydb`, `memcached`                                                                                        | `cache`; queues and streams on it come from `redis.md` and `bullmq.md`                                |
| `rabbitmq`, `nats`, Kafka and Redpanda images                                                                                                 | no node at `medium` (queues and topics found in code are the nodes); one `queue` node at `high-level` |
| `minio/minio`                                                                                                                                 | `storage`, named after the production bucket service it stands in for (S3)                            |
| `localstack/localstack`                                                                                                                       | no node: model the AWS resources it emulates (queues, topics, buckets)                                |
| `mailhog/mailhog`, `axllent/mailpit`                                                                                                          | no node: the production email provider is an `external` node                                          |
| `nginx`, `traefik`, `caddy`, `envoyproxy/envoy`, `kong`                                                                                       | `service` only when it routes between deployables (gateway); otherwise mention it                     |
| `adminer`, `dpage/pgadmin4`, `rediscommander/redis-commander`, `provectuslabs/kafka-ui`, Grafana, Prometheus, Jaeger, OpenTelemetry collector | no node: development tooling and observability                                                        |
| one-off services (`migrate`, `seed`, `init`, `restart: "no"`)                                                                                 | no node; mention migrations in the database description                                               |

- Use the compose service name for the id (`orders-api`, `postgres`, `redis`) unless the code recipes already gave the node an id.
- `deploy.replicas` or `scale` do not create more nodes; mention scaling in the description.
- Groups: Compose describes local development. Prefer production evidence (Terraform, Kubernetes manifests, `vercel.json`, `fly.toml`) for groups; without it, use a simple split such as `backend` and `data` only if it helps.

## Edges

- `depends_on` proves start-up order, not communication. Do not create an edge from it alone.
- An env var that points at another service (`DATABASE_URL: postgres://shop:shop@postgres:5432/shop`, `ORDERS_API_URL: http://orders-api:4000`) is evidence for an edge from the service that has the variable to the service in the host. Confirm the call in code before adding the edge, and take the label from the code recipe.
- Edge kind from the URL scheme: `postgres://`, `postgresql://`, `mysql://`, `mongodb://` give `db`; `redis://` and `rediss://` give `cache`, or `queue` or `event` depending on use (`redis.md`); `http://` and `https://` give `http`; `amqp://` gives `queue`; `nats://` gives `event`; Kafka bootstrap servers (`kafka:9092`) give `event` edges through topic nodes; an S3 or MinIO endpoint gives `storage`.

## Sources to cite

- Node: the compose service block, from the `  <name>:` line to its last line (for example `docker-compose.yml` lines 33 to 38 for `postgres`), alongside the code that defines the node.
- Edge: the env var line in the compose file together with the code call. Compose alone is weak evidence; never cite only `depends_on`.

## Flow hints

- Compose rarely describes flows. Use it to map hostnames and ports to nodes, so that `fetch(process.env.ORDERS_API_URL + "/orders")` resolves to the `orders-api` node, then trace the flow in code.
- Payloads never come from compose files: use the code recipes.

## Pitfalls

- Several compose files (`docker-compose.override.yml`, `compose.dev.yaml`, `docker-compose.test.yml`): the base file is the reference; services that exist only in test files are test infrastructure.
- Compose is usually local development; production may use managed services (RDS instead of the `postgres` container). Keep one node and mention the production service from `externalContext` or IaC in its description and `tech`.
- `${VAR}` values come from `.env` files: read `.env.example` for hostnames; never copy secret values.
- `profiles:` services are optional; include them only when the code uses them in production paths.
- Legacy `links:` and `network_mode:` say nothing about who calls whom.
