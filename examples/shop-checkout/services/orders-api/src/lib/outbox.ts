import type { Prisma } from "@prisma/client";

export interface PaymentJob {
  orderId: string;
  amount: number;
  currency: string;
  paymentMethodId: string;
}

export interface OrderConfirmed {
  orderId: string;
  paymentIntentId: string;
}

type OutboxMessage =
  | { type: "payment.process"; payload: PaymentJob }
  | { type: "order.confirmed"; payload: OrderConfirmed };

/** Rows for `tx.outboxEvent.create`, so a message is only ever stored inside a transaction. */
export function outboxEvent(message: OutboxMessage): Prisma.OutboxEventCreateInput {
  return {
    type: message.type,
    aggregateId: message.payload.orderId,
    payload: message.payload as unknown as Prisma.InputJsonValue,
  };
}
