# AWS SQS and SNS

Detects Amazon SQS queues and SNS topics, their producers, subscriptions and consumers, from SDK calls and infrastructure as code. Produces `queue` nodes for queues and topics, `worker` nodes for consumers, and `queue` and `event` edges. EventBridge follows the SNS rules.

## Signals

- **Dependencies**: `"(@aws-sdk/client-sqs|@aws-sdk/client-sns|@aws-sdk/client-eventbridge|aws-sdk|sqs-consumer|sqs-producer|@ssut/nestjs-sqs)"\s*:` in glob `**/package.json`.
- **SDK v3 commands**, in JS/TS files: `new (SendMessage|SendMessageBatch|ReceiveMessage|DeleteMessage|Publish|PublishBatch|Subscribe|PutEvents)Command\(`.
- **SDK v2 calls**: `\.(sendMessage|sendMessageBatch|receiveMessage|publish)\(\s*\{`.
- **Consumers**: `Consumer\.create\(` (sqs-consumer); Lambda handlers `\b(SQSEvent|SQSHandler|SNSEvent|SNSHandler|EventBridgeEvent)\b` and `event\.Records`.
- **Identifiers**: `\b(QueueUrl|TopicArn|TargetArn)\b`, env vars `\w*(QUEUE_URL|QUEUE_NAME|TOPIC_ARN)\w*`, literals `arn:aws:(sqs|sns):` and `sqs\.[a-z0-9-]+\.amazonaws\.com`.
- **Infrastructure as code**:
  - Terraform, glob `*.tf`: `resource\s+"aws_(sqs_queue|sns_topic|sns_topic_subscription|lambda_event_source_mapping|cloudwatch_event_rule|cloudwatch_event_target)"`.
  - CloudFormation and SAM: `AWS::(SQS::Queue|SNS::Topic|SNS::Subscription|Lambda::EventSourceMapping|Events::Rule)`, SAM events `Type:\s*(SQS|SNS)`.
  - CDK: `new (sqs\.Queue|sns\.Topic|events\.Rule)\(`, `SqsSubscription\(`, `SqsEventSource\(`, `\.addSubscription\(`, `\.addEventSource\(`.
  - Serverless Framework, glob `**/serverless.{yml,yaml}`: `^\s*-\s*(sqs|sns):` under `functions.<name>.events`.
- **Dead letter queues**: `RedrivePolicy|redrive_policy|deadLetterQueue|deadLetterTargetArn|maxReceiveCount`.
- **FIFO**: `\.fifo["']|fifo_queue|FifoQueue|MessageGroupId`.
- **Other languages**: Python `boto3` with `client\(\s*["'](sqs|sns)["']`; Go `aws-sdk-go-v2/service/(sqs|sns)`; Java `software\.amazon\.awssdk\.services\.(sqs|sns)` and Spring `@SqsListener`.

## Nodes

- One `queue` node per SQS queue. Id from the queue name plus `-queue` (`order-events` gives `order-events-queue`), `tech` `["Amazon SQS"]`, adding `FIFO` when it applies. Description: visibility timeout, DLQ and `maxReceiveCount`, FIFO message groups.
- One `queue` node per SNS topic. Id from the topic name plus `-topic`, `tech` `["Amazon SNS"]`. Description: subscriptions and filter policies.
- Dead letter queues: mention them in the source queue's description at `medium`. Give a DLQ its own node only when code consumes or redrives it, or at `detailed`.
- Consumers: a Lambda function or a long-running poller is a `worker` node, one per deployable function group, not one per handler file. An HTTP subscription points at the `service` that receives it.
- EventBridge: one `queue` node per event bus; each rule becomes an `event` edge to its target.
- Group: the AWS account or region group when IaC shows it.

## Edges

- **Producer to SQS queue**: kind `queue`, labelled with the message type (`order.created`) or `SendMessage` when messages are untyped.
- **Publisher to SNS topic**: kind `event`, labelled with the event type.
- **SNS topic to SQS queue** (subscription): kind `event`, labelled `subscription` or with the filter policy (`type = order.created`).
- **SNS topic to Lambda or HTTP endpoint**: kind `event`, labelled with the event type.
- **SQS queue to consumer**: kind `queue`, labelled `consume` or with the message types handled.

## Sources to cite

- Queue or topic node: the IaC resource block (`resource "aws_sqs_queue" "orders" {` through its closing brace) or the CDK construct line. Without IaC, the line that defines the queue URL or ARN.
- Producer edge: the `SendMessageCommand`, `PublishCommand` or `PutEventsCommand` call.
- Subscription edge: the `aws_sns_topic_subscription` block or `addSubscription` line.
- Consumer edge: the event source mapping (or the `events` block in `serverless.yml`) and the handler.

## Flow hints

- Every hop is async: send or publish (`durationMs` 10 to 30), SNS delivery to each subscribed queue, consumer pickup (100 to 1000, more with long polling).
- Send payload: `{ "queue": "order-events", "body": { ... } }`, where `body` comes from the type that is passed to `JSON.stringify` for `MessageBody`. FIFO adds `MessageGroupId` and `MessageDeduplicationId`; add `MessageAttributes` when filters use them.
- SNS to SQS without raw message delivery wraps the message: the consumer sees `{ "Type": "Notification", "TopicArn": "...", "Message": "<JSON string>" }` and calls `JSON.parse(body.Message)`. Check `RawMessageDelivery` or `raw_message_delivery`.
- Lambda consumers receive batches in `event.Records[].body`; partial failures are reported with `batchItemFailures`. Mention batching when it affects the flow.

## Pitfalls

- Queue URLs and ARNs usually come from env vars: resolve them through IaC outputs, `.env.example`, `serverless.yml` `environment`, or SSM parameter names. If you cannot resolve one, name the node after the env var and say so in its description.
- Physical names often include the stage (`${stage}-orders`): use the stable part for ids.
- LocalStack in docker-compose is a local stand-in, not a separate node.
- One queue used by several services is one node with several edges.
- A `ReceiveMessage` and `DeleteMessage` loop is a consumer even without a framework.
