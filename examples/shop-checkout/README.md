# Example: Shop Checkout

A complete `archbook/architecture.json` for a small e-commerce backend: a Next.js storefront, an Express orders API, Postgres with a transactional outbox, an outbox relay, Redis (idempotency keys, a BullMQ payments queue and an `orders:events` stream), a payment worker, a notifications worker, Stripe and Postmark.

It shows patterns worth copying: no dual writes (the order and its event commit in one transaction), one writer per table (only the orders API writes orders; the signed Stripe webhook decides the final status), layered idempotency (form key in Redis, the order id as BullMQ `jobId` and Stripe `Idempotency-Key`, deduplicated webhook events) and a visible event stream read with consumer groups.

The source files are minimal stubs. They exist so that every `sources` entry points to a real file and line range, which lets `archbook validate` pass. They are not meant to run.

Flows documented:

- **Checkout** (10 steps): the order and its outbox row commit together, the API answers 202, the relay enqueues the payment job and the worker creates the Stripe PaymentIntent.
- **Payment confirmation** (5 steps): the signed webhook confirms the order in one transaction and the relay appends `order.confirmed` to the stream.
- **Confirmation email** (5 steps): the notifications worker reads the stream with `XREADGROUP`, sends the email through Postmark and acknowledges with `XACK`.

Open it from the repository root:

```sh
pnpm install
pnpm dev:example
```

Or validate it with the CLI:

```sh
pnpm build
node packages/cli/dist/index.js validate --cwd examples/shop-checkout
```
