---
detect:
  - name: Express
    packages: [express]
  - name: Fastify
    packages: [fastify]
  - name: NestJS
    packages: ["@nestjs/core"]
---

# Express, Fastify and NestJS (HTTP servers)

Detects HTTP servers and their routes. Produces `service` nodes (or `app` for servers that render pages) and the receiving side of `http`, `websocket` and `grpc` edges. Koa, Hono and hapi follow the Express rules.

## Signals

- **Dependencies**: `"(express|fastify|@nestjs/core|@nestjs/platform-express|@nestjs/platform-fastify|koa|@koa/router|hono|@hapi/hapi)"\s*:` in glob `**/package.json`.
- **Bootstrap** (one per deployable), in JS/TS files:
  - Express, Koa, Hono: `\b(express|new Koa|new Hono)\(\)` and `\.listen\(`.
  - Fastify: `\b[Ff]astify\(` and `\.listen\(`.
  - NestJS: `NestFactory\.create\w*(<[^>]*>)?\(`.
- **Routes**, in JS/TS files:
  - Express, Koa router, Hono: `\b(app|router|server|api|\w+Router)\.(get|post|put|patch|delete|all)\(\s*["']/`, plus `\.route\(\s*["']/`.
  - Express mount prefixes: `\b(app|router|\w+Router)\.use\(\s*["']/`.
  - Fastify: `\b(fastify|app|server|instance)\.(get|post|put|patch|delete|all)\(\s*["']/`, `\.route\(\s*\{`, prefixes `prefix:\s*["']/`, and `@fastify/autoload` (the folder path under the autoload dir becomes the URL prefix).
  - NestJS: `@Controller\(`, `@(Get|Post|Put|Patch|Delete|All|Head|Options)\(`, `setGlobalPrefix\(`, `enableVersioning\(`, `@Version\(`, `RouterModule\.register\(`.
- **Not plain HTTP, but found in the same code**:
  - Nest messaging: `@(MessagePattern|EventPattern)\(`, `Transport\.(KAFKA|RMQ|REDIS|NATS|MQTT|GRPC|TCP)`.
  - WebSockets: `@WebSocketGateway\(`, `@SubscribeMessage\(`, `new Server\(` from `socket.io`, `new WebSocketServer\(`.
  - gRPC: `@GrpcMethod\(`, `addService\(`, Glob `**/*.proto`.
- **API descriptions**: Glob `**/{openapi,swagger}*.{yaml,yml,json}`; `@nestjs/swagger` decorators (`@ApiProperty\(`).
- **Other languages** (same modelling): FastAPI `@(app|router)\.(get|post|put|patch|delete)\(`; Flask `@\w+\.route\(`; Django `path\(` in `**/urls.py`; Go `\.(HandleFunc|Handle|GET|POST|PUT|PATCH|DELETE)\(` (net/http, chi, gin, echo); Spring `@(Get|Post|Put|Patch|Delete|Request)Mapping`; Rails `config/routes.rb`; Laravel `Route::(get|post|put|patch|delete)\(`.

## Nodes

- One `service` node per deployable HTTP server: a package or folder with its own start command, Dockerfile or compose service that runs `listen` or `NestFactory.create`. Name it from the package or compose service (`orders-api`, `Orders API`).
- `tech`: runtime, framework, then key libraries: `["Node.js", "NestJS", "TypeORM"]`.
- Routers, controllers, middlewares, guards and Nest modules are not nodes at `medium`: cite them as sources. At `detailed`, each Nest `@Module` with its own controllers is a natural module node.
- A server that renders HTML for browsers (template engine, SSR framework) is an `app`.
- One process that serves HTTP and also consumes a queue is one `service` node; say so in its description. Two entry points in the same package with separate start commands are two nodes.
- Serverless: one `service` node per function group behind one API (`serverless.yml` service, SAM or CDK stack), not one per function.

## Edges

- The server is the `to` side. The `from` side is the caller: another node found with `http-clients.md` or `nextjs.md`, an `external` that sends webhooks (`stripe-webhooks.md`), or an `actor` for public APIs used by people or unknown clients. Never invent an internal caller.
- Kind `http`. Label `METHOD /full/path`, composing every prefix: global prefix, version, mount or controller path, route path. Path parameters as `:id`.
  - `app.use("/orders", ordersRouter)` + `ordersRouter.post("/")` gives `POST /orders`.
  - `setGlobalPrefix("api")` + `@Controller("orders")` + `@Post()` gives `POST /api/orders`.
- Several routes from the same caller: one edge, labelled with the main route or the resource (`/orders/*`); list the routes in `description`.
- WebSocket gateways: `websocket` edge from the client, labelled with the namespace or main message (`/notifications`, `order.updated`).
- gRPC servers: `grpc` edge from the client, labelled `Service/Method` (`OrderService/GetOrder`).

## Sources to cite

- Node: the bootstrap lines (`listen`, `NestFactory.create`), the lines that mount routers or import modules, and the Dockerfile or compose service when present.
- Edge, receiving side: from the route registration to the end of its handler, with `symbol` set to the handler or controller method (`OrdersController.create`). Add the mount line when the prefix is defined elsewhere.
- Edge, calling side: as described by the caller's recipe.

## Flow hints

- Read the handler top to bottom. Each I/O call is a candidate step: validation, cache check, database write, enqueue, publish, outbound HTTP, response. Follow service and repository calls into other files; in NestJS, follow constructor-injected providers.
- Request payload sources: Nest DTO classes in `@Body() dto: CreateOrderDto` (class-validator decorators list the fields), zod schemas (`z.object(` then `.parse(req.body)`), Fastify route `schema: { body }` (JSON Schema or TypeBox `Type.Object(`), OpenAPI files, or the destructuring of `req.body`.
- Response for a `reverse` step: `res.status(202).json(...)`, the controller's return value, `@HttpCode(...)`. Nest answers `201` for `@Post` and `200` otherwise unless `@HttpCode` says so; Express answers `200` by default.
- Middleware changes behaviour: authentication, rate limits, raw body for webhook signatures, idempotency. Mention it in the step description when it affects the flow.

## Pitfalls

- Prefixes split across files: compose them before labelling. Nest URI versioning (`enableVersioning({ type: VersioningType.URI })`) adds `/v1`.
- Health and metrics endpoints (`/health`, `/healthz`, `/ready`, `/metrics`) are not architecture.
- Routes in tests (`supertest`, `*.spec.ts`, `*.e2e-spec.ts`) and mocks (`msw`, `nock`) are not real routes.
- Client calls such as `api.get("/orders")` match the route patterns; check that the receiver is a server or router, not an HTTP client (those belong to `http-clients.md`).
- Nest `@MessagePattern` and `@EventPattern` handlers are messaging, not HTTP: model them with `kafka.md` or `redis.md`.
- A route that exists but is never called and is not public (internal admin, feature-flagged off) can stay out of edges; mention it in the node description if it matters.
