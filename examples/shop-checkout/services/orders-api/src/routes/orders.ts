import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/db";
import { claimIdempotencyKey, releaseIdempotencyKey, storeResponse } from "../lib/idempotency";
import { outboxEvent } from "../lib/outbox";

export const ordersRouter = Router();

const PlaceOrder = z.object({ cartId: z.string(), paymentMethodId: z.string().startsWith("pm_") });

ordersRouter.post("/", async (req, res) => {
  const key = req.header("idempotency-key");
  if (!key) return res.status(400).json({ error: "idempotency_key_required" });
  const { cartId, paymentMethodId } = PlaceOrder.parse(req.body);

  const claim = await claimIdempotencyKey(key);
  if (claim.status === "in-progress") return res.status(409).json({ error: "request_in_progress" });
  if (claim.status === "done") return res.status(202).json(claim.response);

  try {
    const order = await prisma.$transaction(async (tx) => {
      const cart = await tx.cart.findUniqueOrThrow({
        where: { id: cartId },
        include: { items: true },
      });
      const created = await tx.order.create({
        data: {
          id: `ord_${cart.number}`,
          cartId,
          customerEmail: cart.email,
          total: cart.total,
          currency: cart.currency,
          status: "PENDING_PAYMENT",
          items: {
            create: cart.items.map(({ sku, quantity, unitPrice }) => ({
              sku,
              quantity,
              unitPrice,
            })),
          },
        },
      });
      await tx.outboxEvent.create({
        data: outboxEvent({
          type: "payment.process",
          payload: {
            orderId: created.id,
            amount: created.total,
            currency: created.currency,
            paymentMethodId,
          },
        }),
      });
      return created;
    });

    const response = { orderId: order.id, status: order.status };
    await storeResponse(key, response);
    res.status(202).json(response);
  } catch (error) {
    await releaseIdempotencyKey(key);
    throw error;
  }
});

ordersRouter.get("/:id", async (req, res) => {
  const order = await prisma.order.findUniqueOrThrow({ where: { id: req.params.id } });
  res.json({ orderId: order.id, status: order.status });
});
