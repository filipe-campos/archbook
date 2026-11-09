import { UnrecoverableError, Worker } from "bullmq";
import Stripe from "stripe";
import type { PaymentJob } from "../../../services/orders-api/src/lib/outbox";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

new Worker<PaymentJob>(
  "payments",
  async (job) => {
    try {
      const intent = await stripe.paymentIntents.create(
        {
          amount: job.data.amount,
          currency: job.data.currency,
          payment_method: job.data.paymentMethodId,
          confirm: true,
          automatic_payment_methods: { enabled: true, allow_redirects: "never" },
          metadata: { orderId: job.data.orderId },
        },
        // Retries and re-published jobs map to the same PaymentIntent.
        { idempotencyKey: job.data.orderId },
      );
      return { paymentIntentId: intent.id, status: intent.status };
    } catch (error) {
      // A declined card will not succeed on retry; Stripe reports it through the webhook.
      if (error instanceof Stripe.errors.StripeCardError)
        throw new UnrecoverableError(error.code ?? "card_declined");
      throw error;
    }
  },
  { connection: { url: process.env.REDIS_URL }, concurrency: 10 },
);
