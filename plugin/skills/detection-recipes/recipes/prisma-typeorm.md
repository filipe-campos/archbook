# Prisma, TypeORM and other database clients

Detects relational and document databases through ORMs, query builders and drivers. Produces one `database` node per physical database and one `db` edge from each deployable that queries it.

## Signals

- **Dependencies**: `"(@prisma/client|prisma|typeorm|@nestjs/typeorm|drizzle-orm|sequelize|sequelize-typescript|knex|kysely|mongoose|@mikro-orm/core|pg|postgres|mysql2|mongodb|better-sqlite3)"\s*:` in glob `**/package.json`.
- **Prisma**: Glob `**/schema.prisma` and `**/prisma/schema/*.prisma`; `provider\s*=\s*"(postgresql|mysql|sqlite|sqlserver|mongodb|cockroachdb)"` and `url\s*=\s*env\("\w+"\)` in the datasource; client calls `\bprisma\.\w+\.(findMany|findUnique|findUniqueOrThrow|findFirst|create|createMany|update|updateMany|upsert|delete|deleteMany|count|aggregate|groupBy)\(` and `\$(transaction|queryRaw|executeRaw)`.
- **TypeORM**: `@Entity\(`, `new DataSource\(`, `TypeOrmModule\.forRoot(Async)?\(`, `type:\s*["'](postgres|mysql|mariadb|sqlite|better-sqlite3|mssql|oracle|mongodb)["']`, `@InjectRepository\(`, `getRepository\(`, `\.createQueryBuilder\(`.
- **Others**: Drizzle `drizzle\(` and `(pgTable|mysqlTable|sqliteTable)\(`; Sequelize `new Sequelize\(`; Knex `knex\(\s*\{` and `knexfile`; Kysely `new Kysely`; Mongoose `mongoose\.connect\(`, `new Schema\(`, `model\(\s*["']`; drivers `new (Pool|Client)\(` from `pg`, `createPool\(` from `mysql2`, `new MongoClient\(`.
- **Connection env vars**: `\b(DATABASE_URL|DB_HOST|POSTGRES_\w+|MYSQL_\w+|MONGO(DB)?_(URL|URI))\b`.
- **Infrastructure**: compose images `postgres`, `mysql`, `mariadb`, `mongo`, `cockroachdb/cockroach`; Terraform `aws_db_instance|aws_rds_cluster|aws_dynamodb_table|google_sql_database_instance|azurerm_postgresql_\w+`.
- **Other languages**: SQLAlchemy `create_engine\(`; Django `models\.Model` and `DATABASES`; Go `gorm\.Open|sql\.Open|pgxpool\.New`; Rails `config/database.yml`; Spring `spring\.datasource\.url`; Entity Framework `DbContext`.

## Nodes

- One `database` node per physical database (one connection URL or datasource), never one per table, model or entity. Name it by engine (`Postgres`) or, when there are several, by purpose (`Orders DB`, `Analytics DB`). `tech`: engine (with the version if pinned) and the ORM: `["PostgreSQL 16", "Prisma"]`.
- Description: the main tables or models and what they hold, the key status lifecycle, anything unusual (soft deletes, multi-tenancy, row-level security).
- Several deployables sharing one database: one node with an edge from each. Say in the description which deployable owns the schema (where the migrations live).
- Read replicas: one node; mention replica routing (Prisma `readReplicas`, TypeORM `replication`) in the description.
- DynamoDB: one node per table, or one per service with single-table design.
- Elasticsearch or OpenSearch used for search is a `database` too.
- Group: `data`, or the cloud group when IaC shows it.

## Edges

- One `db` edge from each deployable that queries the database, even when it both reads and writes. Label: the main tables or models (`orders`, `orders, payments`), or `read orders` when it only reads.
- Migration runners (CI steps, a `migrate` compose service, release commands) are not edges unless the migration job is itself a node.

## Sources to cite

- Database node: the datasource block and models in `schema.prisma` (or the entities folder as a directory path), plus the compose service or IaC resource that runs the database.
- Edges: one or two representative query call sites in the caller (repository or service function), not every call.

## Flow hints

- Each read or write that matters is a step on the `db` edge. Payload `{ "table", "where"?, plus "insert", "update", "select" or "include" }`, with fields and enum values taken from the model (`schema.prisma`, `@Entity` columns, Drizzle tables, Mongoose schemas).
- A transaction (`$transaction`, `dataSource.transaction`, `queryRunner.startTransaction`) is one step whose description lists the statements, or one step per write when each matters.
- `durationMs` 5 to 30.
- Status enums show the lifecycle of the main entity: describe it on the node and use the exact values in payloads.

## Pitfalls

- Prisma model names differ from table names when `@@map("orders")` is used: pick one naming and keep it consistent in labels and payloads.
- The generated Prisma client (`node_modules/.prisma`) is never a source.
- Several `schema.prisma` files can mean several databases or just a test schema: check `provider` and `url`.
- SQLite used only in tests or local development is not a production database.
- NestJS hides the call behind `@InjectRepository(Order)`: follow the injected repository to find which node queries.
- Raw SQL (`$queryRaw`, `pool.query(`) and migration folders are more evidence for the same database, not new nodes.
