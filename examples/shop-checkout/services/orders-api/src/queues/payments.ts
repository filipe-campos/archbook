import { Queue } from "bullmq";

export interface PaymentJob {
  orderId: string;
  amount: number;
  currency: string;
  paymentMethodId: string;
}

export const paymentsQueue = new Queue<PaymentJob>("payments", {
  connection: { url: process.env.REDIS_URL },
  defaultJobOptions: { attempts: 5, backoff: { type: "exponential", delay: 2000 } },
});
