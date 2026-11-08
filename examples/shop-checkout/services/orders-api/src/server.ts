import express from "express";
import { ordersRouter } from "./routes/orders";
import { stripeWebhookRouter } from "./routes/stripe-webhook";

const app = express();

app.use("/webhooks/stripe", express.raw({ type: "application/json" }), stripeWebhookRouter);
app.use(express.json());
app.use("/orders", ordersRouter);

app.listen(4000, () => console.log("orders-api listening on :4000"));
