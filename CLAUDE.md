# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

**Holon** is a RAG (Retrieval-Augmented Generation) backend system. It's a pnpm + Turborepo monorepo with:
- `apps/api` — Cloudflare Workers API built with Hono (core RAG backend)
- `apps/web` — React frontend (TanStack Router + TanStack Start, Vite, Tailwind v4)
- `packages/ui` — shared UI component library (`@workspace/ui`)

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

### Web app (`apps/web`)
```sh
pnpm dev              # vite dev server on port 3000
pnpm build            # vite build
pnpm typecheck        # tsc --noEmit
```

### Local infrastructure
```sh
docker compose up -d  # start ParadeDB (PostgreSQL 16 + pgvector + pg_search)
```

### Scripts (`scripts/`)
```sh
node scripts/migrate-collection-embeddings.mjs  # backfill embeddings for existing collections
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
- **Database**: PostgreSQL 16 via **ParadeDB** (`paradedb/paradedb:latest-pg16`) with `pgvector` (1536-dim embeddings) and `pg_search` (ParadeDB BM25 full-text search, required for `|||` operator)
- **Validation**: Zod (via `@hono/zod-openapi`)

### Module Structure

Each domain module lives in `src/module/<name>/` with three files:
- `route.ts` — OpenAPI route definitions using `OpenAPIHono` + `createRoute`
- `repository.ts` — DB access via factory function `create<Name>Repository(db)`, returns object of async methods
- `schema.ts` — Zod schemas for request/response bodies, plus DTO types

Complex modules may split routes into a `routes/` subdirectory and add `helpers.ts` for shared logic (e.g. `collection/routes/` contains separate files per resource: collection, documents, parent, search).

The `search` module implements **hybrid vector + BM25 RRF search** across chunks with optional collection scoping. It uses a two-step strategy to work around HNSW pre-filter limitations: Step 1 scopes chunk candidates via CTE, Step 2 runs vector ranking on that subset and BM25 via ParadeDB on the base table, then fuses results with RRF. Search supports `contextWindow` (0–10) to auto-fetch adjacent chunks via the linked-list (`prevChunkId`/`nextChunkId`) using a recursive CTE, returning them as `contextChunks.prev/next` for RAG context expansion.

Modules are registered in `src/module/index.ts` and mounted in `src/index.ts`.

### Dependency Injection

Global middleware in `src/index.ts` runs per request, creates the DB connection and repositories, and injects them into Hono context via `c.set()`. Routes retrieve dependencies via `c.get()`.

The `Env` type in `src/types.ts` defines what's available in `Bindings` (env vars) and `Variables` (context values). Extend `Variables` whenever adding a new repository.

### Database Schema (`src/db/schema/`)

Three core tables:
- **`document`** — top-level document with `title: varchar`, `description: text`, `content: jsonb` (blocks array), and `metadata: jsonb`
- **`chunk`** — text segment of a document with `embedding: vector(1536)`, `content` text, and `prevChunkId`/`nextChunkId` UUIDs forming a **doubly-linked list** for adjacent chunk traversal; has HNSW cosine index (`chunk_embedding_idx`) and BM25 full-text index (`chunk_bm25_idx`) for hybrid search
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

## Gotchas

- **BM25 index must be in schema**: Declare via `index('chunk_bm25_idx').using('bm25', t.id, sql\`(${t.content}::pdb.icu)\`).with({ key_field: 'id' })` in `src/db/schema/`. The `::pdb.icu` cast enables ICU tokenization. Writing it only as raw SQL migration causes `db:generate` to re-detect it as missing on every run.
- **ParadeDB required**: The `pg_search` extension (`|||` BM25 operator) only exists in the ParadeDB image. Using plain `postgres` or `pgvector` images will break the search module.
- **HNSW pre-filter limitation**: HNSW indexes can't be scoped to a subset of rows efficiently. The search repository uses a two-step CTE approach — collect scoped chunk IDs first, then apply vector/BM25 ranking — rather than a simple WHERE clause on a single HNSW scan.
- **Soft delete must always be filtered**: Queries on `document` and `chunk` must include `isNull(deletedAt)` — there's no automatic filter at the DB level.
- **`prepare: false`**: Required for Drizzle's `postgres` driver in Cloudflare Workers (no support for prepared statement protocol).
