import { Router } from "express";
import { prisma } from "../lib/db";
import { claimIdempotencyKey } from "../lib/idempotency";
import { paymentsQueue } from "../queues/payments";

export const ordersRouter = Router();

ordersRouter.post("/", async (req, res) => {
  const { cartId, paymentMethodId } = req.body;

  if (!(await claimIdempotencyKey(req.header("idempotency-key")))) {
    return res.status(409).json({ error: "duplicate_request" });
  }

  const order = await prisma.order.create({
    data: { cartId, status: "PENDING_PAYMENT" },
  });

  await paymentsQueue.add("payment.process", {
    orderId: order.id,
    amount: order.total,
    currency: order.currency,
    paymentMethodId,
  });

  res.status(202).json({ orderId: order.id, status: order.status });
});

ordersRouter.get("/:id", async (req, res) => {
  const order = await prisma.order.findUniqueOrThrow({ where: { id: req.params.id } });
  res.json(order);
});
