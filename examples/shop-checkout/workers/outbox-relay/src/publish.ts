import { Queue } from "bullmq";
import { Redis } from "ioredis";
import type { OrderConfirmed, PaymentJob } from "../../../services/orders-api/src/lib/outbox";

export type OutboxRow =
  | { id: bigint; type: "payment.process"; payload: PaymentJob }
  | { id: bigint; type: "order.confirmed"; payload: OrderConfirmed };

const connection = new Redis(process.env.REDIS_URL!, { maxRetriesPerRequest: null });

const paymentsQueue = new Queue<PaymentJob>("payments", {
  connection,
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: "exponential", delay: 2000 },
    removeOnComplete: { age: 24 * 3600 },
  },
});

export const ORDER_EVENTS_STREAM = "orders:events";

/** At-least-once: a crash before the row is marked published sends it again. */
export async function publish(row: OutboxRow) {
  switch (row.type) {
    case "payment.process":
      // The order id as job id makes a second publish of the same row a no-op.
      await paymentsQueue.add("payment.process", row.payload, { jobId: row.payload.orderId });
      break;
    case "order.confirmed":
      await connection.xadd(
        ORDER_EVENTS_STREAM,
        "MAXLEN",
        "~",
        "100000",
        "*",
        "type",
        row.type,
        "orderId",
        row.payload.orderId,
      );
      break;
  }
}
