import { Prisma } from "@prisma/client";
import { Router } from "express";
import Stripe from "stripe";
import { prisma } from "../lib/db";
import { outboxEvent } from "../lib/outbox";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
export const stripeWebhookRouter = Router();

stripeWebhookRouter.post("/", async (req, res) => {
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      req.header("stripe-signature")!,
      process.env.STRIPE_WEBHOOK_SECRET!,
    );
  } catch {
    return res.sendStatus(400);
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.processedStripeEvent.create({ data: { id: event.id } });
      if (
        event.type !== "payment_intent.succeeded" &&
        event.type !== "payment_intent.payment_failed"
      )
        return;

      const intent = event.data.object;
      const orderId = intent.metadata.orderId!;
      const succeeded = event.type === "payment_intent.succeeded";
      const { count } = await tx.order.updateMany({
        where: { id: orderId, status: "PENDING_PAYMENT" },
        data: succeeded
          ? { status: "CONFIRMED", paymentIntentId: intent.id, paidAt: new Date() }
          : { status: "FAILED", paymentIntentId: intent.id },
      });
      if (succeeded && count === 1) {
        await tx.outboxEvent.create({
          data: outboxEvent({
            type: "order.confirmed",
            payload: { orderId, paymentIntentId: intent.id },
          }),
        });
      }
    });
  } catch (error) {
    const duplicate =
      error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
    if (!duplicate) throw error;
  }

  res.sendStatus(200);
});
