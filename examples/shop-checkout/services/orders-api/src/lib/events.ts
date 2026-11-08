import { redis } from "./idempotency";

export type DomainEvent = "order.confirmed";

export async function publishEvent(type: DomainEvent, data: Record<string, unknown>) {
  await redis.xadd("events:orders", "*", "type", type, "data", JSON.stringify(data));
}
