# SQL Executor Service

Independent PostgreSQL query executor. Each deployment serves exactly one project/database. Client applications send only an allowlisted query UID and typed values; SQL is managed by reviewed database migrations.

## Local setup

```bash
copy .env.example .env
npm install
npm test
docker compose up --build
```

Use `SQL_EXECUTOR_ENV_FILE` to point Compose at a project-specific env file without copying secrets into this codebase.

Before starting the service, a DBA must:

1. Create the three login roles using `database/roles.example.sql` as a template.
2. Run `database/migrations/001_create_query_catalog.sql`.
3. Run `database/migrations/002_grants.sql`.
4. Grant project-specific `SELECT`, DML, or routine `EXECUTE` privileges.
5. Insert reviewed queries into `t_sql` through versioned SQL migrations.

The container never creates or upgrades production database objects automatically.

## API

`GET /health` is public for container health checks. All `/v1` routes require `x-project-code` and `x-api-key`.

```bash
curl -X POST http://127.0.0.1:3200/v1/queries/execute \
  -H "content-type: application/json" \
  -H "x-project-code: swm" \
  -H "x-api-key: replace-with-at-least-16-characters" \
  -d '{"queryUid":"example.find-by-id","params":[{"name":"id","value":1}],"context":{"requestId":"d3ca4351-b991-49c7-9ad9-f6a72e279c53","actorUserId":"1"}}'
```

The service never accepts SQL, identifiers, ordering expressions, or operators from the request. `GET /v1/queries/catalog` intentionally omits `sql_text`.
Both returned row count and serialized response bytes are capped. A write whose returned payload exceeds the configured byte limit is rolled back.

## Deployment model

Build one image and run one container per project. Every instance must have its own project code, API key, database credentials, catalog, and private network endpoint. Browsers must call a project backend such as Strapi, not this service directly.
