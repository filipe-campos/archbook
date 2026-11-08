---
detect:
  - name: Kafka
    packages: [kafkajs, "@confluentinc/kafka-javascript", node-rdkafka]
---

# Kafka

Detects Kafka (and Kafka-compatible brokers such as Redpanda) producers, consumers and topics. Produces one `queue` node per topic that matters and `event` edges from producers to topics and from topics to consumers.

## Signals

- **Dependencies**: `"(kafkajs|@confluentinc/kafka-javascript|node-rdkafka|@platformatic/kafka|@nestjs/microservices)"\s*:` in glob `**/package.json`.
- **Producers**, in JS/TS files: `\.producer\(`, `\.send\(\s*\{\s*topic`, `\.sendBatch\(`, Nest `ClientKafka` and `\.emit\(\s*["']`.
- **Topic names**: `topic:\s*["'\w]`, `topics:\s*\[`, constants `[A-Z_]*TOPIC[A-Z_]*\s*=\s*["']`.
- **Consumers**: `\.consumer\(\s*\{`, `groupId:\s*["']`, `\.subscribe\(\s*\{\s*topics?:`, `eachMessage|eachBatch`, Nest `@(EventPattern|MessagePattern)\(` with `Transport\.KAFKA`.
- **Infrastructure**: compose images `(confluentinc/cp-kafka|bitnami/kafka|apache/kafka|redpandadata/redpanda|vectorized/redpanda)`; Terraform `confluent_kafka_topic|aws_msk_cluster`; Strimzi `kind:\s*KafkaTopic`; admin `createTopics\(`.
- **Schemas**: `@kafkajs/confluent-schema-registry`, `SchemaRegistry`, Glob `**/*.{avsc,proto}`.
- **Change data capture**: `connector\.class` or `io\.debezium` in connector configs.
- **Other languages**: Python `confluent-kafka|aiokafka|kafka-python|faust` in `requirements*.txt` or `pyproject.toml`; Go `segmentio/kafka-go|confluent-kafka-go|IBM/sarama|twmb/franz-go` in `go.mod`; JVM `spring-kafka|kafka-clients|kafka-streams` in `pom.xml` or `build.gradle*`, and `@KafkaListener\(`.

## Nodes

- One `queue` node per topic that matters. Id from the topic name with dots and underscores turned into hyphens, plus `-topic` (`orders.events` gives `orders-events-topic`). Name: the literal topic name. `tech`: `["Kafka"]`, plus `Avro`, `Protobuf` or `Schema Registry` when used. Description: message key, partitions, retention, schema.
- The cluster itself is not a node at `medium`. At `high-level`, use one `queue` node named `Kafka` for the whole bus.
- Producers and consumers are their deployable nodes. A process whose main job is consuming is a `worker`.
- Consumer groups are not nodes: name them in edge descriptions.
- More than about ten topics: keep the topics that connect different deployables or appear in documented flows; summarise the rest in the producer's description.
- Kafka Connect or Debezium deployed from this repo: a `worker` node.

## Edges

- **Producer to topic**: kind `event`, labelled with the event types (`order.created`), or the topic name when a topic carries one event type.
- **Topic to consumer**: kind `event`, labelled with the event types handled or the consumer group.
- **Change data capture**: connector to database (`db`, labelled `WAL` or `binlog`), then connector to topic (`event`).
- **Request-reply over Kafka** (Nest `@MessagePattern` with `client.send()`): still `event` edges; write "request-reply" in the description.

## Sources to cite

- Topic node: the topic definition (IaC, `createTopics`, Strimzi manifest, compose init script); without one, the topic name constant.
- Producer edge: the `send` or `emit` call.
- Consumer edge: the `subscribe` or `@EventPattern` lines and the handler.

## Flow hints

- Every produce and consume step is `async: true`. `durationMs`: produce 5 to 50, consumer lag 10 to 500.
- Payload: `{ "topic", "key", "value", "headers"? }`, with `value` from the event's TypeScript type, Avro schema, protobuf message or JSON schema. The key decides the partition and therefore ordering; it is usually an entity id.
- Look for retry and dead letter topics (`.retry`, `.DLT`, `-dlq`) and mention them in the consumer edge description.
- Outbox pattern: the service writes an `outbox` table in the same transaction and a relay or Debezium publishes it. Flow: service to database (sync), then relay to topic (async).

## Pitfalls

- Topic names built at runtime (`${env}.orders.events`): drop the environment prefix in ids.
- Regex subscriptions (`topics: [/^orders\./]`) cover several topics.
- `@nestjs/microservices` also runs Redis, NATS and RabbitMQ transports: confirm `Transport.KAFKA` before applying this recipe.
- The same topic name in compose init scripts, tests and code is one node.
- Compose services such as `kafka`, `zookeeper`, `schema-registry` and `kafka-ui` are infrastructure, not nodes at `medium`.
