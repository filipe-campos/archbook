import { Redis } from "ioredis";
import { prisma } from "./db";
import { sendOrderConfirmation } from "./email";

const redis = new Redis(process.env.REDIS_URL!);
const STREAM = "orders:events";
const GROUP = "notifications";
const CONSUMER = process.env.HOSTNAME ?? "notifications-1";

async function main() {
  await redis.xgroup("CREATE", STREAM, GROUP, "$", "MKSTREAM").catch(() => {});

  for (;;) {
    const batch = await redis.xreadgroup(
      "GROUP",
      GROUP,
      CONSUMER,
      "COUNT",
      10,
      "BLOCK",
      5000,
      "STREAMS",
      STREAM,
      ">",
    );
    for (const [id, fields] of parse(batch)) {
      if (fields.type === "order.confirmed") {
        const order = await prisma.order.findUniqueOrThrow({
          where: { id: fields.orderId },
          include: { items: true },
        });
        await sendOrderConfirmation(order);
      }
      // Acknowledged only after the email is accepted; unacked messages are reclaimed with XAUTOCLAIM.
      await redis.xack(STREAM, GROUP, id);
    }
  }
}

main();
