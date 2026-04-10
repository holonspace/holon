# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

**Holon** is a RAG (Retrieval-Augmented Generation) backend system. It's a pnpm + Turborepo monorepo with a single app: `apps/api` — a Cloudflare Workers API built with Hono.

## Commands

### Root (monorepo)
```sh
pnpm install          # install all dependencies
pnpm dev              # start all apps in dev mode
pnpm build            # build all apps
pnpm lint             # lint all
pnpm check-types      # TypeScript type check across all packages
pnpm format           # Prettier format all TS/MD files
```

### API app (`apps/api`)
```sh
pnpm dev              # wrangler dev (Cloudflare Workers local server)
pnpm deploy           # deploy to Cloudflare Workers
pnpm check-types      # tsc --noEmit
pnpm cf-typegen       # regenerate CloudflareBindings types from wrangler config

# Database (requires .dev.vars with DATABASE_URL)
pnpm db:generate      # drizzle-kit generate (create migration files)
pnpm db:migrate       # drizzle-kit migrate (apply migrations)
pnpm db:push          # drizzle-kit push (sync schema without migrations)
```

### Local infrastructure
```sh
docker compose up -d  # start PostgreSQL with pgvector + pg_trgm extensions
```

## Environment / Secrets

Local secrets go in `apps/api/.dev.vars` (Cloudflare Workers convention, gitignored):
```
DATABASE_URL=postgres://postgres:postgres@localhost:5432/holon
OPENAI_API_KEY=sk-...   # required for collection embedding (create/search)
```

## Architecture

### Stack
- **Runtime**: Cloudflare Workers (Node.js compat mode)
- **Framework**: Hono with `@hono/zod-openapi` for typed routes and OpenAPI spec generation
- **ORM**: Drizzle ORM with `postgres` driver (`prepare: false` for Workers compatibility)
- **Database**: PostgreSQL 16 with `pgvector` (1536-dim embeddings) and `pg_trgm` (trigram full-text search)
- **Validation**: Zod (via `@hono/zod-openapi`)

### Module Structure

Each domain module lives in `src/module/<name>/` with three files:
- `route.ts` — OpenAPI route definitions using `OpenAPIHono` + `createRoute`
- `repository.ts` — DB access via factory function `create<Name>Repository(db)`, returns object of async methods
- `schema.ts` — Zod schemas for request/response bodies, plus DTO types

Complex modules may split routes into a `routes/` subdirectory and add `helpers.ts` for shared logic (e.g. `collection/routes/` contains separate files per resource: collection, documents, parent, search).

Modules are registered in `src/module/index.ts` and mounted in `src/index.ts`.

### Dependency Injection

Global middleware in `src/index.ts` runs per request, creates the DB connection and repositories, and injects them into Hono context via `c.set()`. Routes retrieve dependencies via `c.get()`.

The `Env` type in `src/types.ts` defines what's available in `Bindings` (env vars) and `Variables` (context values). Extend `Variables` whenever adding a new repository.

### Database Schema (`src/db/schema/`)

Three core tables:
- **`document`** — top-level document with `content: jsonb` (blocks array) and `metadata: jsonb`
- **`chunk`** — text segment of a document with `embedding: vector(1536)`, `position`, and `content` text; has HNSW cosine index and GIN trigram index for hybrid search
- **`collection`** — hierarchical folder/group using the **closure table pattern** (`collection_closure` stores ancestor/descendant/depth rows); documents join collections via `document_to_collection`; also has `embedding: vector(1536)` for semantic collection search via `@langchain/openai` (`text-embedding-3-small`)

Soft delete is implemented on `document` and `chunk` via `deleted_at` timestamp (always filter `isNull(deletedAt)` in queries).

### DB Types (`src/db/types/`)

JSONB field shapes and Drizzle-inferred insert/select types are separated into `src/db/types/<name>.ts`. Import from here rather than re-inferring inline.

### Error Handling

Use typed exception classes from `src/lib/errors.ts` (e.g. `NotFoundException`, `BadRequestException`). All extend `HTTPException` and are caught by the global `app.onError` handler in `src/index.ts`.

### Path Aliases

`@/` resolves to `src/` (configured in `tsconfig.json`).

### OpenAPI / Swagger UI

- Spec available at `GET /doc`
- Swagger UI at `GET /ui`
