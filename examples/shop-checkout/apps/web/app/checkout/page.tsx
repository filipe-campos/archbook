import { PaymentElement } from "@stripe/react-stripe-js";
import { placeOrder } from "./actions";

export default function CheckoutPage({ cart }: { cart: Cart }) {
  // One key per rendered form: a double click or a retried submit reuses it.
  const idempotencyKey = crypto.randomUUID();

  return (
    <form action={placeOrder}>
      <input type="hidden" name="cartId" value={cart.id} />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <PaymentElement />
      <button type="submit">Pay {formatPrice(cart.total)}</button>
    </form>
  );
}
