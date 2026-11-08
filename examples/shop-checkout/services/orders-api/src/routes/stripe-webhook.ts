import { Router } from "express";
import Stripe from "stripe";
import { prisma } from "../lib/db";
import { claimStripeEvent } from "../lib/idempotency";
import { publishEvent } from "../lib/events";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
export const stripeWebhookRouter = Router();

stripeWebhookRouter.post("/", async (req, res) => {
  const event = stripe.webhooks.constructEvent(
    req.body,
    req.header("stripe-signature")!,
    process.env.STRIPE_WEBHOOK_SECRET!,
  );

  if (!(await claimStripeEvent(event.id))) {
    return res.sendStatus(200);
  }

  if (event.type === "payment_intent.succeeded") {
    const intent = event.data.object as Stripe.PaymentIntent;
    const order = await prisma.order.update({
      where: { id: intent.metadata.orderId },
      data: { status: "CONFIRMED", paidAt: new Date() },
    });
    await publishEvent("order.confirmed", { orderId: order.id });
  }

  res.sendStatus(200);
});
