"use server";

import { redirect } from "next/navigation";

export async function placeOrder(form: FormData) {
  const response = await fetch(`${process.env.ORDERS_API_URL}/orders`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "idempotency-key": String(form.get("idempotencyKey")),
    },
    body: JSON.stringify({
      cartId: form.get("cartId"),
      paymentMethodId: form.get("paymentMethodId"),
    }),
  });

  if (response.status === 409) throw new Error("This order is already being placed.");
  const order: { orderId: string } = await response.json();
  redirect(`/orders/${order.orderId}`);
}
