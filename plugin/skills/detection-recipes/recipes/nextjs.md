---
detect:
  - name: Next.js
    packages: [next]
---

# Next.js

Detects Next.js projects: pages, App Router route handlers, Pages Router API routes, server actions, middleware and rewrites. Produces one `app` node per Next.js project and the edges its server code and browser code create.

## Signals

- **Dependency**: `"next"\s*:` in glob `**/package.json`. Config: Glob `**/next.config.{js,mjs,cjs,ts}`.
- **App Router route handlers**: Glob `**/app/**/route.{ts,js}`; inside, `export\s+(async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b` or `export\s+const\s+(GET|POST|PUT|PATCH|DELETE)\b`.
- **Pages Router API routes**: Glob `**/pages/api/**/*.{ts,js}`.
- **Server actions**: `^\s*["']use server["']` in JS/TS files (file-level or function-level directive), and `<form action=\{` in components.
- **Middleware**: Glob `**/middleware.{ts,js}` next to `app/` or `pages/`; `matcher:` lists the paths it runs on; `NextResponse\.(rewrite|redirect)\(`.
- **Server-side I/O** in `page.tsx`, `layout.tsx`, `route.ts`, server actions, `getServerSideProps` or `getStaticProps`: `\bawait fetch\(`, `\bprisma\.`, `\bdb\.`, SDK clients.
- **Browser-side calls**: files starting with `["']use client["']` that call `fetch\(`, `useSWR\(`, `useQuery\(`, `axios`, or tRPC (`createTRPC`, `trpc\.\w+\.(useQuery|useMutation)`).
- **Env vars**: `process\.env\.NEXT_PUBLIC_\w+` is inlined into browser code; other `process\.env\.\w+` reads are server-only.
- **Rewrites and proxies**: `(rewrites|redirects)\(\)` in `next.config.*`, with `destination:\s*["']https?://`.
- **Hosting**: `vercel.json`, `.vercel/`, `output:\s*["']standalone["']` (self-hosted container), `@opennextjs`, `@netlify/plugin-nextjs`.

## Nodes

- One `app` node per Next.js project, even when it has API routes and server actions. Name it from the product (README) or the folder (`apps/web` becomes `Web App`). `tech`: `["Next.js", "React", "TypeScript"]` plus key libraries (`tRPC`, `NextAuth`, `Prisma`).
- Route handlers, server actions, pages and middleware are sources, not nodes. At `detailed`, a large API surface (`app/api/**`) may become a module node.
- Hosting becomes a group when there is evidence (`vercel.json` gives a `vercel` group).
- The people using the app are an `actor` (`customer`, `admin`) with an `http` edge to the app, labelled `HTTPS` or the main page path.
- Several Next.js apps in a monorepo (`apps/web`, `apps/admin`) are one node each.

## Edges

- **Server-side calls** (server actions, route handlers, server components, `getServerSideProps`): `app -> target`, kind by target: `http` to services and externals, `db` to databases (Prisma, Drizzle), `cache` to Redis, `storage` to buckets. Label with the target's route: `POST /orders`.
- **Browser calls to other origins** (`NEXT_PUBLIC_API_URL`, Stripe.js, Supabase client): also `app -> target`; write "from the browser" in the description because it affects auth and CORS.
- **Browser calls to the app's own `/api/*` routes or server actions** stay inside the node: no edge.
- **Inbound calls** to route handlers from other systems (mobile apps, webhooks): `caller -> app`, `http`, labelled with the route: `app/api/webhooks/stripe/route.ts` exporting `POST` gives `POST /api/webhooks/stripe`.
- **Rewrites** that proxy to another host: `http` edge `app -> that host`, labelled with the proxied path (`/api/:path*`).

## Sources to cite

- Node: `next.config.*`, the root `app/layout.tsx` or `pages/_app.tsx`, and the page where the main flow starts (`app/checkout/page.tsx`).
- Edges: the lines of the server action, route handler export or `fetch` call, with `symbol` set to the action or handler name (`placeOrder`, `POST`).
- Rewrite edges: the `rewrites()` entry.

## Flow hints

- Typical flow: the actor submits a form (`actor -> app`), the server action calls a backend or the database (`app -> service`), then `redirect()` or `revalidatePath()` happens inside the app. Describe the redirect in the step; it is not an edge.
- URL from file path: `app/orders/[id]/page.tsx` is `/orders/:id`; route groups `(shop)` and private folders `_components` are not URL segments; `[...slug]` is `:slug*`; `pages/api/orders/[id].ts` is `/api/orders/:id`.
- Payload sources: zod schemas in actions (`schema.parse(Object.fromEntries(formData))`, `safeParse`), typed action parameters, form field names (`form.get("cartId")`), `await request.json()` parsed with zod in route handlers.
- Responses: `NextResponse.json(data, { status })`, `Response.json(...)`, `redirect(...)`.

## Pitfalls

- A file with `"use server"` runs on the server even when a client component imports it. In `app/`, a component without `"use client"` is a server component.
- `NEXT_PUBLIC_*` URLs are called from the browser, others from the server; both are edges from the same `app` node.
- Rewrites in `next.config.*` and `NextResponse.rewrite(new URL(...))` in middleware hide edges to other hosts.
- Build-time fetches (`generateStaticParams`, `getStaticProps`, `fetch` with `cache: "force-cache"` or `next: { revalidate }`) still depend on the target; say "at build time" or "revalidated every N seconds" in the edge description.
- `pages/` and `app/` can coexist in one project: scan both.
- `export const runtime = "edge"` changes where the code runs; mention it in the node or edge description.
