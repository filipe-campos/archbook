import { Redis } from "ioredis";
import { prisma } from "./db";
import { sendOrderConfirmation } from "./email";

const redis = new Redis(process.env.REDIS_URL!);

async function main() {
  await redis.xgroup("CREATE", "events:orders", "notifications", "$", "MKSTREAM").catch(() => {});

  for (;;) {
    const batch = await redis.xreadgroup(
      "GROUP",
      "notifications",
      "worker-1",
      "BLOCK",
      5000,
      "STREAMS",
      "events:orders",
      ">",
    );
    for (const [id, fields] of parse(batch)) {
      if (fields.type === "order.confirmed") {
        const { orderId } = JSON.parse(fields.data);
        const order = await prisma.order.findUniqueOrThrow({
          where: { id: orderId },
          include: { items: true },
        });
        await sendOrderConfirmation(order);
      }
      await redis.xack("events:orders", "notifications", id);
    }
  }
}

main();
