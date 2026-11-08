import { Worker } from "bullmq";
import Stripe from "stripe";
import { prisma } from "./db";
import type { PaymentJob } from "../../../services/orders-api/src/queues/payments";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

new Worker<PaymentJob>(
  "payments",
  async (job) => {
    const intent = await stripe.paymentIntents.create(
      {
        amount: job.data.amount,
        currency: job.data.currency,
        payment_method: job.data.paymentMethodId,
        confirm: true,
        metadata: { orderId: job.data.orderId },
      },
      { idempotencyKey: `order-${job.data.orderId}` },
    );

    await prisma.order.update({
      where: { id: job.data.orderId },
      data: { status: "PAYMENT_PROCESSING", paymentIntentId: intent.id },
    });
  },
  { connection: { url: process.env.REDIS_URL }, concurrency: 10 },
);
