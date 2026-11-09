import { PrismaClient } from "@prisma/client";
import { publish, type OutboxRow } from "./publish";

const prisma = new PrismaClient();
const BATCH_SIZE = 50;
const IDLE_MS = 200;

/** Claims a batch of unpublished rows; SKIP LOCKED lets several relays run side by side. */
async function relayBatch(): Promise<number> {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<OutboxRow[]>`
      SELECT id, type, payload FROM "OutboxEvent"
      WHERE "publishedAt" IS NULL
      ORDER BY id
      LIMIT ${BATCH_SIZE}
      FOR UPDATE SKIP LOCKED`;

    for (const row of rows) {
      await publish(row);
      await tx.outboxEvent.update({ where: { id: row.id }, data: { publishedAt: new Date() } });
    }
    return rows.length;
  });
}

async function main() {
  for (;;) {
    const published = await relayBatch();
    if (published === 0) await new Promise((resolve) => setTimeout(resolve, IDLE_MS));
  }
}

main();
