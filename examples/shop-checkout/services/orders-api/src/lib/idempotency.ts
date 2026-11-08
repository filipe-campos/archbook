import { Redis } from "ioredis";

export const redis = new Redis(process.env.REDIS_URL!);

const DAY_IN_SECONDS = 60 * 60 * 24;

export async function claimIdempotencyKey(key: string | undefined) {
  if (!key) return true;
  return (await redis.set(`idem:${key}`, "1", "EX", DAY_IN_SECONDS, "NX")) === "OK";
}

export async function claimStripeEvent(eventId: string) {
  return (await redis.set(`stripe-event:${eventId}`, "1", "EX", DAY_IN_SECONDS, "NX")) === "OK";
}
