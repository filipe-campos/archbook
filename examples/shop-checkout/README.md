# Example: Shop Checkout

A complete `archbook/architecture.json` for a small e-commerce backend: a Next.js storefront, an Express orders API, Postgres, Redis, a BullMQ payments queue, a payment worker, a notifications worker, Stripe and an email provider.

The source files are minimal stubs. They exist so that every `sources` entry points to a real file and line range, which lets `archbook validate` pass. They are not meant to run.

Flows documented:

- **Checkout** (8 steps): the customer pays, the order is stored, the payment is queued and charged through Stripe.
- **Stripe webhook → order confirmed** (5 steps): signature check, event deduplication in Redis, order confirmation.
- **Order confirmation email** (4 steps): Redis stream consumer, Postgres lookup, templated email.

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
