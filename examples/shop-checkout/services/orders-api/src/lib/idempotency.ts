import { Redis } from "ioredis";

const redis = new Redis(process.env.REDIS_URL!);
const DAY_IN_SECONDS = 60 * 60 * 24;

type Claim =
  { status: "claimed" } | { status: "in-progress" } | { status: "done"; response: unknown };

/** Stripe-style idempotency: the first request claims the key, retries replay its response. */
export async function claimIdempotencyKey(key: string): Promise<Claim> {
  const claimed = await redis.set(`idem:${key}`, "pending", "EX", DAY_IN_SECONDS, "NX");
  if (claimed === "OK") return { status: "claimed" };
  const stored = await redis.get(`idem:${key}`);
  return stored === "pending"
    ? { status: "in-progress" }
    : { status: "done", response: JSON.parse(stored!) };
}

export async function storeResponse(key: string, response: unknown) {
  await redis.set(`idem:${key}`, JSON.stringify(response), "EX", DAY_IN_SECONDS);
}

/** Frees the key when the request failed, so the client can retry with the same key. */
export async function releaseIdempotencyKey(key: string) {
  await redis.del(`idem:${key}`);
}
