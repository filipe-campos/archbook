---
detect:
  - name: Axios
    packages: [axios]
---

# HTTP clients

Detects outbound HTTP calls (`fetch`, axios, got, ky, generated API clients and third-party SDKs) and decides whether each target is another node of this system or an external system. Produces outbound `http` edges and `external` nodes. gRPC clients follow the same rules with `grpc` edges.

## Signals

- **Dependencies**: `"(axios|got|ky|node-fetch|undici|superagent|ofetch|openapi-fetch|@hey-api/client-fetch|graphql-request|@apollo/client|urql|@grpc/grpc-js)"\s*:` in glob `**/package.json`.
- **Calls**, in JS/TS files: `\bfetch\(`, `\baxios(\.(get|post|put|patch|delete|request))?\(`, `\.(get|post|put|patch|delete)<[^>]+>\(` (typed client calls), `\bgot(\.(get|post|put|patch|delete))?\(`, `\bky(\.(get|post|put|patch|delete))?\(`, `\$fetch\(`, `request\(\s*\{`.
- **Client factories and base URLs**: `axios\.create\(`, `baseURL:`, `prefixUrl:`, `ky\.create\(`, `new GraphQLClient\(`, `new ApolloClient\(`.
- **Env vars that hold targets**: `process\.env\.\w*(URL|URI|HOST|ENDPOINT|BASE|ORIGIN)\w*`, and the same names in `.env.example`, compose `environment:` and IaC.
- **Hard-coded hosts**: `https?://[a-z0-9.-]+\.[a-z]{2,}` in JS/TS and config files.
- **Third-party SDKs**, in imports: `from\s+["'](stripe|openai|@anthropic-ai/sdk|@sendgrid/mail|postmark|resend|twilio|@slack/web-api|@octokit/rest|algoliasearch|@google-cloud/[a-z-]+|@aws-sdk/client-[a-z0-9-]+|firebase-admin|@supabase/supabase-js|@clerk/[a-z-]+)["']`. Stripe has its own recipe (`stripe-webhooks.md`); AWS queues and topics have `aws-sqs-sns.md`; S3 clients are `storage` edges.
- **Generated clients**: Glob `**/*.gen.ts`, `**/generated/**`, `**/{openapi,swagger}*.{yaml,yml,json}`; dependencies `orval`, `openapi-typescript`, `@openapitools/openapi-generator-cli`.
- **Other languages**: Python `requests|httpx|aiohttp` (`requests\.(get|post)\(`, `httpx\.(AsyncClient|Client)\(`); Go `http\.(Get|Post|NewRequest(WithContext)?)\(`; Java `RestTemplate|WebClient|OkHttpClient|@FeignClient`; Ruby `Faraday|Net::HTTP|HTTParty`.

## Nodes

Classify every target before creating anything:

1. **Find the base URL**: a literal, an `axios.create({ baseURL })` or `ky.create({ prefixUrl })`, or an env var.
2. **Resolve env vars** through `.env.example`, compose `environment:`, Kubernetes manifests, Helm values, IaC and config modules (`config.ts`, `@nestjs/config`).
3. **Decide**:
   - **Internal**: the host is a compose service, a Kubernetes Service, internal DNS (`*.svc.cluster.local`, `*.internal`), `localhost:<port>` matching another deployable's port, or the env var is named after a deployable in this repo (`ORDERS_API_URL`). The edge goes to that existing node; no new node.
   - **Known third party**: a public provider domain (`api.openai.com`, `api.postmarkapp.com`, `hooks.slack.com`) or its SDK. One `external` node per provider, named after it (`OpenAI`, `Postmark`, `Slack`).
   - **Unknown domain** (`api.partner-logistics.com`): an `external` node named after the organisation or domain; say in the description what the code uses it for.
   - **Unresolvable env var** (`PRICING_API_URL` with no value anywhere): check `externalContext` in `archbook/config.json` first. Otherwise create an `external` node named after the variable's meaning (`Pricing API`) and state in its description that the target was inferred from `PRICING_API_URL`.
   - **Same origin**: relative URLs (`/api/...`) called from a frontend served by the same node: no edge.

- One `external` node per provider, never one per endpoint or SDK method.

## Edges

- `caller -> target`, kind `http` (`grpc` for gRPC stubs, `websocket` for `new WebSocket(` or `socket.io-client`).
- Label: `METHOD /path` relative to the base URL, path parameters as `:id` (`GET /v1/rates/:currency`). GraphQL: `POST /graphql`, or the operation name (`query GetOrder`) when there is a main one. SDK calls: the REST path when the SDK maps clearly to one (`POST /v1/chat/completions`), otherwise the SDK method (`sendEmailWithTemplate`).
- One edge per caller and target; several endpoints go into the description.

## Sources to cite

- The call site lines, with `symbol` set to the enclosing function.
- The client factory or wrapper module (`axios.create`, `lib/api-client.ts`) when calls go through it.
- The env var or base URL definition that resolved the target (compose `environment:` line, `.env.example` line), when it was needed to classify the target.

## Flow hints

- Request payload sources: the function parameters that build the body, generated OpenAPI types, zod schemas, the SDK method's argument object.
- Response payload for a `reverse` step: the generic type of the call (`axios.get<Order>()`, `ky.get(...).json<Order>()`), the zod schema that parses the response, or the generated response type.
- Retries and timeouts (`axios-retry`, `p-retry`, `AbortSignal.timeout(5000)`, `timeout:`) belong in the edge or step description, not in `durationMs`.
- `durationMs`: 20 to 150 for internal calls, 200 to 2000 for third parties, 1000 to 20000 for LLM APIs.

## Pitfalls

- Calls usually go through a wrapper (`apiClient.post(...)`, `http.get(...)`): find the wrapper, resolve its base URL once, then find its callers.
- Browser and server calls look the same; `NEXT_PUBLIC_*` or `VITE_*` variables mean the browser makes the call. Both are edges from the frontend node, but say which in the description.
- Test hosts in `nock(...)`, `msw` handlers and fixtures are not real targets, though they can reveal the real endpoints.
- Telemetry and error reporting SDKs (Sentry, Datadog, Segment, PostHog) are not architecture unless `archbook/config.json` asks for them or a documented flow depends on them.
- Health checks and self-pings are not edges.
- A URL assembled from several config values (`${config.api.protocol}://${config.api.host}`): read the config module rather than guessing.
