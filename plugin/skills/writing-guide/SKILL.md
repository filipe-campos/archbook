---
name: writing-guide
description: Tone, structure, language and presentation rules for every text field of archbook/architecture.json (node, edge and group descriptions, summaries, names, labels, tech chips, flow names, triggers, step text and payloads) for developers, stakeholders or mixed audiences, in any configured language. Use whenever you write, rewrite or polish text in an Archbook architecture document.
---

# Archbook writing guide

People open Archbook to understand a system fast. Every sentence must tell them something true and specific that the diagram does not already show.

## Rules for every audience

- Describe only what the code, or the facts you were given, confirm. When unsure, leave it out.
- Be concrete: name the route, queue, table, event, retry count, timeout. "Retries up to 5 times with exponential backoff from 2 s" beats "handles failures gracefully".
- Do not repeat what the viewer already shows next to the text: the node name, its kind, its tech list.
- No filler or hype: robust, seamless, scalable, powerful, leverages, various, simply.
- Present tense, active voice. No future tense ("will call"), no "we".
- No em-dashes: use a comma, a colon, parentheses or a new sentence.
- Text lives in JSON strings: write line breaks as `\n` and escape double quotes.

## Audiences

### developers

Technical and precise. Reference code symbols and files in inline code (`placeOrder`, `routes/orders.ts`), name protocols and formats (HTTP, gRPC, Redis Streams, JSON), and say how the component behaves under failure: retries, timeouts, idempotency, ordering, dead letters, what is transactional.

### stakeholders

Business responsibility in plain language. No jargon, and no code identifiers unless a name is how people know the thing. Say why it matters and what customers or the business notice when it fails. Name third-party products (Stripe, Postmark), since they are business relationships.

### mixed

Lead with one business sentence a stakeholder understands, then a short technical paragraph for developers. Summaries follow the stakeholder style.

## Fields

### `summary` (nodes and flows)

One sentence, under about 20 words, ending with a period. For nodes, start with what it does, verb first ("Creates orders...", "Stores..."). Never open with "This service", "Responsible for" or the node name.

### `description` (nodes, edges, groups)

Markdown: short paragraphs of 2 to 4 sentences, or a bulleted list when listing routes, jobs or rules. Inline code for identifiers, routes, env vars, tables, queues and events. Bold only for the one thing a reader must not miss. No headings above level 3: `###` is the largest allowed, and only in long descriptions such as the output of `/archbook:explain`. No tables or images.

- Nodes: what it owns and does, its main entrypoints, the data it writes, and how it fails.
- Edges: only when the interaction has something worth knowing: authentication, signature checks, payload format, retries, idempotency, ordering, sync versus async. Skip the description rather than write "A calls B".
- Groups: one sentence on the boundary it represents (hosting, network, ownership).

### Flows

- `name`: a short noun phrase ("Checkout", "Order refund").
- `summary`: one or two sentences from trigger to outcome.
- `trigger`: the concrete event that starts it: "Customer clicks \"Pay\" on the checkout page", "Cron runs daily at 02:00 UTC", "Stripe sends `payment_intent.succeeded`".
- Step `title`: present tense, actor first, under about 60 characters, no trailing period.
- Step `description`: one or two sentences on what matters in this hop (validation, persistence, idempotency, retries, what the caller waits for). Omit it when the title says everything.

## Length by `detailLevel`

- `high-level`: descriptions of 1 to 3 sentences.
- `medium`: up to about 120 words.
- `detailed`: up to about 250 words, bullets encouraged.
- In-depth explanations (`/archbook:explain`): up to about 400 words with `###` sections.

## Presentation in the viewer

The viewer shows every short field in a fixed space. Text that fits reads as a finished product; text that overflows is cut with an ellipsis. Write to these limits:

| Field                 | Where it appears                                          | Aim for                                  |
| --------------------- | --------------------------------------------------------- | ---------------------------------------- |
| Node `name`           | One line on a 240 px card, cut with an ellipsis           | Up to about 22 characters                |
| Node `tech`           | Only the first 3 entries show as chips on the card        | 1 to 3 entries, most identifying first   |
| Edge `label`          | Monospace pill on the edge, cut at about 200 px           | Up to about 24 characters                |
| Group `name`          | Uppercase label at the top of the group box               | 1 to 3 words                             |
| Flow `name`           | Flow picker, flow cards and the replay bar                | 1 to 3 words                             |
| Step `title`          | Timeline cards, clamped to 2 lines of about 26 characters | Up to about 48 characters                |
| Step `payload`        | Syntax-highlighted JSON in the side panel                 | Under about 12 lines when formatted      |
| `project.description` | The overview headline, under the project name             | One crisp sentence, under about 20 words |

- **Names.** Sentence case ("Payment worker", "Orders API"), except for brands and acronyms. Name what the thing is, not where it lives: "Orders API", not "orders-service-v2 (k8s)". Do not repeat the kind: "Postgres", not "Postgres database".
- **Tech chips.** Short canonical product names with a major version when the code pins one: `PostgreSQL 16`, `Next.js 15`, `BullMQ`, `Redis 7`, `Stripe SDK`. No duplicates, no synonyms of the kind ("Database", "Queue"), and no language names such as `TypeScript` unless the language is what tells this component apart from its neighbours. Put the framework or product that identifies the component first.
- **Edge labels.** The thing on the wire, not a sentence: `POST /orders`, `payment.process`, `SELECT orders`, `consume`, `webhook`. Use the same verb style for every edge of the same kind.
- **Group names.** The boundary, short: "Backend services", "Data stores", "AWS us-east-1", "Vercel".
- **Payloads.** A realistic example of what travels in that hop, trimmed to the fields that matter for the step. Reuse the same example values across the steps of one flow (`ord_42`, `cus_9`, `5998`), so a reader can follow one order from start to finish. Never include secrets or real personal data.
- **Rhythm.** Siblings share a structure: step titles all start with the actor and a present-tense verb, node summaries all start with a verb, edge labels of one kind share a format. The same concept has one name everywhere ("order", not "order" in one place and "purchase" in another).

## Language

- Write all prose in the configured `language` (`en`, `pt-BR`, `es`, ...), with its natural grammar and punctuation, not a literal translation from English.
- Never translate ids, code identifiers, routes, event and queue names, table names, env vars, or technology and product names (Stripe, Postgres, BullMQ, Next.js).
- Display names: translate generic words when natural ("Customer" becomes "Cliente", "Payments Queue" becomes "Fila de pagamentos"); keep brand and product names.

## Examples

**Node summary**

- Bad: "This service is responsible for handling the orders of the application."
- Bad: "Robust and scalable Orders API."
- Good (developers): "Creates orders, queues their payment and confirms them from Stripe webhooks."
- Good (stakeholders): "Records each customer order and makes sure it is charged exactly once."

**Node description, developers**

> Only writer of the `Order` table.
>
> - `POST /orders` validates the cart, stores the order as `PENDING_PAYMENT`, enqueues `payment.process` and answers `202` without waiting for the charge.
> - `POST /webhooks/stripe` verifies the `stripe-signature` header against the raw body and deduplicates event ids in Redis before marking the order `CONFIRMED`.

**Same node, stakeholders**

> Takes every order placed on the website and starts the payment. Customers get an answer right away while the card is charged in the background. If this component is down, nobody can check out.

**Same node, mixed**

> Takes every order placed on the website and starts the payment. If it is down, nobody can check out.
>
> `POST /orders` stores the order as `PENDING_PAYMENT` and enqueues a `payment.process` job; a Stripe webhook later marks it `CONFIRMED`.

**Edge description**

- Bad: "The web app calls the Orders API."
- Good: "Called from the `placeOrder` server action with an `idempotency-key` header, so a double click cannot create two orders."

**Step titles**

- Bad: "Payment", "Calling Stripe", "Then the payment worker will call Stripe to create the payment intent."
- Good: "Customer submits the checkout form", "API answers 202 Accepted", "Worker creates a Stripe PaymentIntent".

**Language (`pt-BR`)**

- Good summary: "Cria pedidos, enfileira o pagamento e os confirma a partir dos webhooks do Stripe."
- Good step title: "Worker de pagamento cobra o cartão no Stripe"
- Bad: translating identifiers, as in "enfileira `processar.pagamento`" for `payment.process`.
