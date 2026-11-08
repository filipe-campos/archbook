import { placeOrder } from "./actions";

export default function CheckoutPage({ cart }: { cart: Cart }) {
  return (
    <form action={placeOrder}>
      <input type="hidden" name="cartId" value={cart.id} />
      <CardElement />
      <button type="submit">Pay {formatPrice(cart.total)}</button>
    </form>
  );
}
