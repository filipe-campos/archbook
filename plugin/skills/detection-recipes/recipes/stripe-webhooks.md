---
detect:
  - name: Stripe
    packages: [stripe]
---

# Stripe and inbound webhooks

Detects Stripe API calls and Stripe webhooks, plus inbound webhooks from any other provider (GitHub, Shopify, Clerk, Twilio, Slack). Produces `external` provider nodes, outbound `http` edges to them and inbound `http` edges from them to the node that hosts the webhook route.

## Signals

- **Dependencies**: `"(stripe|@stripe/stripe-js|@stripe/react-stripe-js)"\s*:` in glob `**/package.json`.
- **Client**, in JS/TS files: `new Stripe\(`, `Stripe\(process\.env`.
- **API calls**: `stripe\.(paymentIntents|setupIntents|checkout\.sessions|customers|subscriptions|invoices|refunds|prices|products|paymentMethods|billingPortal\.sessions|accounts|transfers)\.(create|retrieve|update|list|confirm|capture|cancel)\(`.
- **Webhook verification**: `webhooks\.constructEvent(Async)?\(`, `stripe-signature`, `STRIPE_WEBHOOK_SECRET`.
- **Handled event types**: `case\s+["'][a-z_]+\.[a-z_.]+["']` and `type\s*===?\s*["'][a-z_]+\.[a-z_.]+["']`.
- **Raw body** (needed to verify signatures): `express\.raw\(`, `bodyParser\.raw\(`, `rawBody`, `await req(uest)?\.text\(\)`.
- **Browser**: `loadStripe\(`, `<(Elements|PaymentElement|CardElement)\b`, `stripe\.confirm\w*\(`, `redirectToCheckout\(`.
- **Generic inbound webhooks**:
  - Routes: `["'][^"']*/webhooks?([/"']|$)` in JS/TS files.
  - Signature headers, case-insensitive: `(x-hub-signature-256|x-shopify-hmac-sha256|svix-signature|webhook-signature|x-slack-signature|x-twilio-signature|paypal-transmission-sig)`.
  - Libraries: `"(svix|@octokit/webhooks|@slack/bolt|@clerk/backend|twilio|@shopify/shopify-api)"\s*:` in `**/package.json`.
  - Hand-written HMAC checks: `createHmac\(` together with `timingSafeEqual\(`.
- **Other languages**: Python `stripe\.Webhook\.construct_event\(`; Go `webhook\.ConstructEvent\(` (`stripe-go`); Ruby `Stripe::Webhook\.construct_event`.

## Nodes

- `stripe`: kind `external`, name `Stripe`, `tech` `["Stripe API"]`, summary saying what this system uses Stripe for (card payments, subscriptions, Connect payouts). One node however many Stripe APIs are used. Links to the dashboard or docs are fine.
- Every other webhook provider: one `external` node each (`github`, `shopify`, `clerk`).
- The webhook receiver is the existing node that hosts the route (`service`, or a Next.js `app`). The handler is a source, not a node.
- Stripe.js in the browser is not a separate node: its calls are edges from the `app`.

## Edges

- **Outbound API calls**: `caller -> stripe`, kind `http`, labelled with the REST path behind the SDK method:
  - `paymentIntents.create`: `POST /v1/payment_intents`
  - `checkout.sessions.create`: `POST /v1/checkout/sessions`
  - `customers.create`: `POST /v1/customers`
  - `subscriptions.create`: `POST /v1/subscriptions`
  - `refunds.create`: `POST /v1/refunds`
  - `<resource>.retrieve(id)`: `GET /v1/<resource>/:id`

  When one caller uses many methods, label the edge `Stripe API` and list the methods in the description.

- **Inbound webhook**: `stripe -> receiver`, kind `http`, labelled `POST <route path>` (`POST /webhooks/stripe`). Description: the event types handled, how the signature is verified, how duplicates are ignored.
- **Browser to Stripe** (Stripe.js tokenization, Checkout redirect): `app -> stripe`, kind `http`, only when a flow needs it, for example to show that card data never reaches the backend.
- The outbound call and the webhook go in opposite directions, so they are two edges: `orders-api-to-stripe` and `stripe-to-orders-api`.

## Sources to cite

- Webhook edge: the route registration, including any raw-body middleware line, and the `constructEvent` lines. Add the `switch` or `if` on `event.type`.
- Outbound edge: the SDK call.
- Provider nodes: none needed (kind `external`).

## Flow hints

- Split a payment into two flows: the request that creates the PaymentIntent or Checkout Session, and the webhook flow that confirms it later. The webhook flow's trigger names the event: `Stripe sends payment_intent.succeeded`.
- First webhook step: `stripe -> receiver`, `async: true`, payload the event as received, `{ "id": "evt_...", "type": "...", "data": { "object": { ... } } }`, keeping only `id`, `type` and the fields the handler reads.
- Then: deduplication by event id (when present), state changes, events published, and a final `reverse` step with `{ "status": 200 }`. Any non-2xx answer makes Stripe retry, for up to three days in live mode.
- Payload values: Stripe id prefixes (`pi_`, `cs_`, `evt_`, `cus_`, `sub_`, `in_`, `pm_`), amounts in the smallest currency unit, and the `metadata` or `client_reference_id` that links back to your records (`orderId`).

## Pitfalls

- Direction: a webhook is `stripe -> receiver`, never `receiver -> stripe`.
- `stripe listen --forward-to` in scripts or docs is the Stripe CLI for local development, not an edge.
- Never copy keys (`sk_live_`, `sk_test_`, `rk_`, `whsec_`) into payloads or descriptions.
- If a handler skips signature verification or deduplication, state it plainly in the edge description: it is an architectural fact.
- Stripe Connect calls with `stripeAccount` act on connected accounts; mention it in the edge description.
- Handlers that re-fetch the object (`stripe.paymentIntents.retrieve`) add an outbound step to the webhook flow.
