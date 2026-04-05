# Document & Collection System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a document-collection storage and hybrid search system (pgvector + pg_trgm RRF) on Cloudflare Workers + Hono + Drizzle ORM + PostgreSQL.

**Architecture:** PostgreSQL 16 + pgvector runs in Docker Compose for local dev. The CF Workers API enables `nodejs_compat` to use `pg` driver directly. Documents join collections via a `document_collection` junction table; collection-scoped queries use `= ANY(subquery)` to avoid explicit JOIN. Search combines vector ANN (HNSW) and trigram similarity via Reciprocal Rank Fusion (RRF, k=60).

**Tech Stack:** Cloudflare Workers · Hono · `@hono/zod-openapi` · Drizzle ORM (`node-postgres` adapter) · `pg` · `pgvector` · `pg_trgm` · Zod · TypeScript · Docker Compose

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `docker-compose.yml` | Create | PostgreSQL 16 + pgvector container |
| `apps/api/.dev.vars` | Create | Local secrets (`DB_URL`) |
| `apps/api/wrangler.jsonc` | Modify | Enable `nodejs_compat` |
| `apps/api/package.json` | Modify | Add drizzle-orm, pg, drizzle-kit deps |
| `apps/api/drizzle.config.ts` | Create | Drizzle Kit config |
| `apps/api/src/db/schema.ts` | Create | Drizzle table + index definitions |
| `apps/api/src/db/client.ts` | Create | `createDb()` factory (pg Pool + Drizzle) |
| `apps/api/src/db/migrate.ts` | Create | Migration runner script |
| `apps/api/src/db/migrations/0000_init.sql` | Create | Full SQL migration (tables + indexes) |
| `apps/api/src/modules/collection/schema.ts` | Create | Zod schemas for collection |
| `apps/api/src/modules/collection/repository.ts` | Create | Collection CRUD DB logic |
| `apps/api/src/modules/collection/route.ts` | Create | Hono OpenAPI routes for collection |
| `apps/api/src/modules/document/schema.ts` | Create | Zod schemas for document |
| `apps/api/src/modules/document/repository.ts` | Create | Document CRUD + chunk + collection link logic |
| `apps/api/src/modules/document/route.ts` | Create | Hono OpenAPI routes for document |
| `apps/api/src/lib/search.ts` | Create | RRF global + collection-scoped search queries |
| `apps/api/src/modules/search/route.ts` | Create | `POST /search` Hono OpenAPI route |
| `apps/api/src/index.ts` | Modify | Register all routes + DB middleware |

---

## Task 1: Docker Compose — PostgreSQL + pgvector

**Files:**
- Create: `docker-compose.yml` (project root `/f/holon/`)

- [ ] **Step 1: Create `docker-compose.yml`**

```yaml
# docker-compose.yml
services:
  postgres:
    image: pgvector/pgvector:pg16
    container_name: holon-postgres
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: holon
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  postgres_data:
```

- [ ] **Step 2: Start the container**

```bash
docker compose up -d
```

Expected output: `holon-postgres` container running.

- [ ] **Step 3: Verify pgvector is available**

```bash
docker exec holon-postgres psql -U postgres -d holon -c "CREATE EXTENSION IF NOT EXISTS vector; SELECT extversion FROM pg_extension WHERE extname='vector';"
```

Expected: a row with pgvector version (e.g. `0.8.0`).

- [ ] **Step 4: Commit**

```bash
git add docker-compose.yml
git commit -m "feat: add docker-compose for postgres + pgvector"
```

---

## Task 2: Configure Cloudflare Workers for Node.js compat

**Files:**
- Modify: `apps/api/wrangler.jsonc`
- Create: `apps/api/.dev.vars`

- [ ] **Step 1: Update `wrangler.jsonc`**

Replace the entire file content with:

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "api",
  "main": "src/index.ts",
  "compatibility_date": "2026-04-05",
  "compatibility_flags": ["nodejs_compat"]
}
```

- [ ] **Step 2: Create `apps/api/.dev.vars`**

```ini
DB_URL="postgresql://postgres:postgres@localhost:5432/holon"
```

- [ ] **Step 3: Add `.dev.vars` to `apps/api/.gitignore`**

Open `apps/api/.gitignore` and verify (or add) `.dev.vars` is listed. It must NOT be committed to git.

- [ ] **Step 4: Commit**

```bash
cd /f/holon
git add apps/api/wrangler.jsonc apps/api/.gitignore
git commit -m "feat: enable nodejs_compat for postgres support"
```

---

## Task 3: Install Dependencies

**Files:**
- Modify: `apps/api/package.json`

- [ ] **Step 1: Install runtime dependencies**

```bash
cd /f/holon/apps/api
pnpm add drizzle-orm pg
```

- [ ] **Step 2: Install dev dependencies**

```bash
pnpm add -D drizzle-kit @types/pg
```

- [ ] **Step 3: Verify `package.json` has these entries**

After install, `apps/api/package.json` dependencies should include:
```json
{
  "dependencies": {
    "drizzle-orm": "...",
    "pg": "..."
  },
  "devDependencies": {
    "@types/pg": "...",
    "drizzle-kit": "..."
  }
}
```

- [ ] **Step 4: Add migrate + generate scripts to `apps/api/package.json`**

Open `apps/api/package.json` and add to `"scripts"`:
```json
"db:generate": "drizzle-kit generate",
"db:migrate": "tsx src/db/migrate.ts"
```

Also add `tsx` dev dependency:
```bash
pnpm add -D tsx
```

- [ ] **Step 5: Commit**

```bash
cd /f/holon
git add apps/api/package.json pnpm-lock.yaml
git commit -m "feat: add drizzle-orm, pg and tooling deps"
```

---

## Task 4: Drizzle Schema

**Files:**
- Create: `apps/api/src/db/schema.ts`

- [ ] **Step 1: Create `apps/api/src/db/schema.ts`**

```typescript
import {
  pgTable, serial, varchar, text, jsonb, integer,
  timestamp, index, primaryKey,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { customType } from 'drizzle-orm/pg-core'

// pgvector custom type (drizzle-orm built-in vector may vary by version)
const vector = customType<{ data: number[]; driverData: string }>({
  dataType(config?: { dimensions?: number }) {
    return config?.dimensions ? `vector(${config.dimensions})` : 'vector'
  },
  fromDriver(value: string): number[] {
    // Postgres returns vector as "[1,2,3]" string
    return value.slice(1, -1).split(',').map(Number)
  },
  toDriver(value: number[]): string {
    return `[${value.join(',')}]`
  },
})

export const collection = pgTable('collection', {
  id:          serial('id').primaryKey(),
  title:       varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  metadata:    jsonb('metadata').notNull().default({}),
  createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:   timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_collection_created_at').on(t.createdAt.desc()),
  index('idx_collection_metadata').using('gin', t.metadata),
])

export const document = pgTable('document', {
  id:               serial('id').primaryKey(),
  title:            varchar('title', { length: 255 }).notNull(),
  description:      text('description'),
  content:          jsonb('content').notNull().default({}),
  contentText:      text('content_text'),
  embedding:        vector('embedding', { dimensions: 1536 }),
  parentDocumentId: integer('parent_document_id'),
  chunkIndex:       integer('chunk_index'),
  chunkTotal:       integer('chunk_total'),
  metadata:         jsonb('metadata').notNull().default({}),
  createdAt:        timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:        timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  // HNSW and trigram indexes are added manually in the migration SQL
  // (drizzle-kit cannot express these operators natively)
  index('idx_document_parent').on(t.parentDocumentId)
    .where(sql`${t.parentDocumentId} IS NOT NULL`),
  index('idx_document_created_at').on(t.createdAt.desc()),
  index('idx_document_metadata').using('gin', t.metadata),
])

export const documentCollection = pgTable('document_collection', {
  documentId:   integer('document_id').notNull().references(() => document.id, { onDelete: 'cascade' }),
  collectionId: integer('collection_id').notNull().references(() => collection.id, { onDelete: 'cascade' }),
  position:     integer('position'),
  addedAt:      timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  primaryKey({ columns: [t.documentId, t.collectionId] }),
  index('idx_document_collection_collection_id').on(t.collectionId, t.documentId),
])

export type Collection           = typeof collection.$inferSelect
export type NewCollection        = typeof collection.$inferInsert
export type Document             = typeof document.$inferSelect
export type NewDocument          = typeof document.$inferInsert
export type DocumentCollection   = typeof documentCollection.$inferSelect
```

- [ ] **Step 2: Commit**

```bash
cd /f/holon
git add apps/api/src/db/schema.ts
git commit -m "feat: add drizzle schema for collection, document, document_collection"
```

---

## Task 5: DB Client

**Files:**
- Create: `apps/api/src/db/client.ts`

- [ ] **Step 1: Create `apps/api/src/db/client.ts`**

```typescript
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from './schema'

export function createDb(connectionString: string) {
  const pool = new Pool({
    connectionString,
    ssl: false,          // local Docker; set ssl: true for production Neon/RDS
    max: 5,
  })
  return drizzle(pool, { schema })
}

export type Db = ReturnType<typeof createDb>
```

- [ ] **Step 2: Commit**

```bash
cd /f/holon
git add apps/api/src/db/client.ts
git commit -m "feat: add drizzle db client factory"
```

---

## Task 6: SQL Migration File

**Files:**
- Create: `apps/api/src/db/migrations/0000_init.sql`
- Create: `apps/api/drizzle.config.ts`

- [ ] **Step 1: Create `apps/api/drizzle.config.ts`**

```typescript
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './src/db/schema.ts',
  out:    './src/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DB_URL ?? 'postgresql://postgres:postgres@localhost:5432/holon',
  },
})
```

- [ ] **Step 2: Create `apps/api/src/db/migrations/0000_init.sql`**

Write the full migration manually (drizzle-kit generate cannot express HNSW / trigram operators):

```sql
-- Enable extensions
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- collection
CREATE TABLE IF NOT EXISTS collection (
  id          SERIAL PRIMARY KEY,
  title       VARCHAR(255) NOT NULL,
  description TEXT,
  metadata    JSONB        NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_collection_created_at ON collection(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_collection_metadata ON collection USING gin(metadata);

-- document
CREATE TABLE IF NOT EXISTS document (
  id                 SERIAL PRIMARY KEY,
  title              VARCHAR(255) NOT NULL,
  description        TEXT,
  content            JSONB        NOT NULL DEFAULT '{}',
  content_text       TEXT,
  embedding          vector(1536),
  parent_document_id INTEGER      REFERENCES document(id) ON DELETE SET NULL,
  chunk_index        INTEGER,
  chunk_total        INTEGER,
  metadata           JSONB        NOT NULL DEFAULT '{}',
  created_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Vector ANN index (HNSW, cosine similarity)
CREATE INDEX IF NOT EXISTS idx_document_embedding_hnsw
  ON document USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Trigram index for keyword / substring search
CREATE INDEX IF NOT EXISTS idx_document_content_text_trgm
  ON document USING gin(content_text gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_document_metadata
  ON document USING gin(metadata);

CREATE INDEX IF NOT EXISTS idx_document_parent
  ON document(parent_document_id)
  WHERE parent_document_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_document_created_at
  ON document(created_at DESC);

-- document_collection (junction)
CREATE TABLE IF NOT EXISTS document_collection (
  document_id   INTEGER     NOT NULL REFERENCES document(id)   ON DELETE CASCADE,
  collection_id INTEGER     NOT NULL REFERENCES collection(id) ON DELETE CASCADE,
  position      INTEGER,
  added_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (document_id, collection_id)
);

CREATE INDEX IF NOT EXISTS idx_document_collection_collection_id
  ON document_collection(collection_id, document_id);
```

- [ ] **Step 3: Commit**

```bash
cd /f/holon
git add apps/api/drizzle.config.ts apps/api/src/db/migrations/
git commit -m "feat: add drizzle config and initial migration SQL"
```

---

## Task 7: Migration Runner + Apply Migration

**Files:**
- Create: `apps/api/src/db/migrate.ts`

- [ ] **Step 1: Create `apps/api/src/db/migrate.ts`**

```typescript
import { Pool } from 'pg'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

async function migrate() {
  const url = process.env.DB_URL ?? 'postgresql://postgres:postgres@localhost:5432/holon'
  const pool = new Pool({ connectionString: url, ssl: false })

  console.log('Running migration...')
  const sql = readFileSync(join(__dirname, 'migrations/0000_init.sql'), 'utf8')
  await pool.query(sql)
  await pool.end()
  console.log('Migration complete.')
}

migrate().catch((err) => {
  console.error('Migration failed:', err)
  process.exit(1)
})
```

- [ ] **Step 2: Make sure Docker postgres is running**

```bash
docker compose up -d
docker compose ps
```

Expected: `holon-postgres` is `running (healthy)`.

- [ ] **Step 3: Run the migration**

```bash
cd /f/holon/apps/api
DB_URL="postgresql://postgres:postgres@localhost:5432/holon" pnpm tsx src/db/migrate.ts
```

Expected output:
```
Running migration...
Migration complete.
```

- [ ] **Step 4: Verify tables exist**

```bash
docker exec holon-postgres psql -U postgres -d holon -c "\dt"
```

Expected: three tables — `collection`, `document`, `document_collection`.

- [ ] **Step 5: Verify HNSW index exists**

```bash
docker exec holon-postgres psql -U postgres -d holon -c "\di idx_document_embedding_hnsw"
```

Expected: the index is listed.

- [ ] **Step 6: Commit**

```bash
cd /f/holon
git add apps/api/src/db/migrate.ts
git commit -m "feat: add migration runner script"
```

---

## Task 8: Collection Zod Schemas

**Files:**
- Create: `apps/api/src/modules/collection/schema.ts`

- [ ] **Step 1: Create `apps/api/src/modules/collection/schema.ts`**

```typescript
import { z } from 'zod'

export const CollectionSchema = z.object({
  id:          z.number().int().positive(),
  title:       z.string().min(1).max(255),
  description: z.string().nullable(),
  metadata:    z.record(z.unknown()),
  createdAt:   z.string().datetime(),
  updatedAt:   z.string().datetime(),
})

export const CreateCollectionSchema = z.object({
  title:       z.string().min(1).max(255),
  description: z.string().optional(),
  metadata:    z.record(z.unknown()).default({}),
})

export const UpdateCollectionSchema = CreateCollectionSchema.partial()

export type CollectionDto       = z.infer<typeof CollectionSchema>
export type CreateCollectionDto = z.infer<typeof CreateCollectionSchema>
export type UpdateCollectionDto = z.infer<typeof UpdateCollectionSchema>
```

- [ ] **Step 2: Commit**

```bash
cd /f/holon
git add apps/api/src/modules/collection/schema.ts
git commit -m "feat: add collection zod schemas"
```

---

## Task 9: Collection Repository

**Files:**
- Create: `apps/api/src/modules/collection/repository.ts`

- [ ] **Step 1: Create `apps/api/src/modules/collection/repository.ts`**

```typescript
import { eq } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { collection } from '@/db/schema'
import type { CreateCollectionDto, UpdateCollectionDto } from './schema'

export async function listCollections(db: Db) {
  return db.select().from(collection).orderBy(collection.createdAt)
}

export async function getCollectionById(db: Db, id: number) {
  const rows = await db.select().from(collection).where(eq(collection.id, id)).limit(1)
  return rows[0] ?? null
}

export async function createCollection(db: Db, data: CreateCollectionDto) {
  const rows = await db.insert(collection).values({
    title:       data.title,
    description: data.description ?? null,
    metadata:    data.metadata,
  }).returning()
  return rows[0]
}

export async function updateCollection(db: Db, id: number, data: UpdateCollectionDto) {
  const rows = await db.update(collection)
    .set({
      ...(data.title       !== undefined && { title:       data.title }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.metadata    !== undefined && { metadata:    data.metadata }),
      updatedAt: new Date(),
    })
    .where(eq(collection.id, id))
    .returning()
  return rows[0] ?? null
}

export async function deleteCollection(db: Db, id: number) {
  const rows = await db.delete(collection).where(eq(collection.id, id)).returning()
  return rows[0] ?? null
}
```

- [ ] **Step 2: Commit**

```bash
cd /f/holon
git add apps/api/src/modules/collection/repository.ts
git commit -m "feat: add collection repository (CRUD)"
```

---

## Task 10: Collection Routes

**Files:**
- Create: `apps/api/src/modules/collection/route.ts`

- [ ] **Step 1: Create `apps/api/src/modules/collection/route.ts`**

```typescript
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import type { Db } from '@/db/client'
import {
  CollectionSchema, CreateCollectionSchema, UpdateCollectionSchema,
} from './schema'
import * as repo from './repository'

type Env = { Variables: { db: Db } }

const router = new OpenAPIHono<Env>()

// POST /collections
router.openapi(
  createRoute({
    method: 'post', path: '/collections',
    request: { body: { content: { 'application/json': { schema: CreateCollectionSchema } } } },
    responses: {
      201: { description: 'Created', content: { 'application/json': { schema: CollectionSchema } } },
    },
  }),
  async (c) => {
    const body = c.req.valid('json')
    const row = await repo.createCollection(c.var.db, body)
    return c.json(row, 201)
  }
)

// GET /collections
router.openapi(
  createRoute({
    method: 'get', path: '/collections',
    responses: {
      200: { description: 'List', content: { 'application/json': { schema: z.array(CollectionSchema) } } },
    },
  }),
  async (c) => {
    const rows = await repo.listCollections(c.var.db)
    return c.json(rows)
  }
)

// GET /collections/:id
router.openapi(
  createRoute({
    method: 'get', path: '/collections/{id}',
    request: { params: z.object({ id: z.coerce.number().int().positive() }) },
    responses: {
      200: { description: 'Found',     content: { 'application/json': { schema: CollectionSchema } } },
      404: { description: 'Not found', content: { 'application/json': { schema: z.object({ error: z.string() }) } } },
    },
  }),
  async (c) => {
    const { id } = c.req.valid('param')
    const row = await repo.getCollectionById(c.var.db, id)
    if (!row) return c.json({ error: 'Not found' }, 404)
    return c.json(row)
  }
)

// PATCH /collections/:id
router.openapi(
  createRoute({
    method: 'patch', path: '/collections/{id}',
    request: {
      params: z.object({ id: z.coerce.number().int().positive() }),
      body: { content: { 'application/json': { schema: UpdateCollectionSchema } } },
    },
    responses: {
      200: { description: 'Updated',   content: { 'application/json': { schema: CollectionSchema } } },
      404: { description: 'Not found', content: { 'application/json': { schema: z.object({ error: z.string() }) } } },
    },
  }),
  async (c) => {
    const { id } = c.req.valid('param')
    const body   = c.req.valid('json')
    const row    = await repo.updateCollection(c.var.db, id, body)
    if (!row) return c.json({ error: 'Not found' }, 404)
    return c.json(row)
  }
)

// DELETE /collections/:id
router.openapi(
  createRoute({
    method: 'delete', path: '/collections/{id}',
    request: { params: z.object({ id: z.coerce.number().int().positive() }) },
    responses: {
      200: { description: 'Deleted',   content: { 'application/json': { schema: CollectionSchema } } },
      404: { description: 'Not found', content: { 'application/json': { schema: z.object({ error: z.string() }) } } },
    },
  }),
  async (c) => {
    const { id } = c.req.valid('param')
    const row    = await repo.deleteCollection(c.var.db, id)
    if (!row) return c.json({ error: 'Not found' }, 404)
    return c.json(row)
  }
)

export default router
```

- [ ] **Step 2: Commit**

```bash
cd /f/holon
git add apps/api/src/modules/collection/route.ts
git commit -m "feat: add collection OpenAPI routes"
```

---

## Task 11: Document Zod Schemas

**Files:**
- Create: `apps/api/src/modules/document/schema.ts`

- [ ] **Step 1: Create `apps/api/src/modules/document/schema.ts`**

```typescript
import { z } from 'zod'

export const DocumentSchema = z.object({
  id:               z.number().int().positive(),
  title:            z.string().min(1).max(255),
  description:      z.string().nullable(),
  content:          z.record(z.string(), z.unknown()),
  contentText:      z.string().nullable(),
  embedding:        z.array(z.number()).nullable(),   // 1536 dims when present
  parentDocumentId: z.number().int().positive().nullable(),
  chunkIndex:       z.number().int().min(0).nullable(),
  chunkTotal:       z.number().int().min(1).nullable(),
  metadata:         z.record(z.string(), z.unknown()),
  createdAt:        z.string().datetime(),
  updatedAt:        z.string().datetime(),
})

export const CreateDocumentSchema = z.object({
  title:            z.string().min(1).max(255),
  description:      z.string().optional(),
  content:          z.record(z.string(), z.unknown()).default({}),
  contentText:      z.string().optional(),
  // NOTE: Zod v4 — use plain array; caller is responsible for correct dimensions
  embedding:        z.array(z.number()).optional(),
  parentDocumentId: z.number().int().positive().optional(),
  chunkIndex:       z.number().int().min(0).optional(),
  chunkTotal:       z.number().int().min(1).optional(),
  metadata:         z.record(z.string(), z.unknown()).default({}),
})

export const UpdateDocumentSchema = CreateDocumentSchema.partial()

export const AddToCollectionSchema = z.object({
  collectionId: z.number().int().positive(),
  position:     z.number().int().optional(),
})

export type DocumentDto        = z.infer<typeof DocumentSchema>
export type CreateDocumentDto  = z.infer<typeof CreateDocumentSchema>
export type UpdateDocumentDto  = z.infer<typeof UpdateDocumentSchema>
export type AddToCollectionDto = z.infer<typeof AddToCollectionSchema>
```

- [ ] **Step 2: Commit**

```bash
cd /f/holon
git add apps/api/src/modules/document/schema.ts
git commit -m "feat: add document zod schemas"
```

---

## Task 12: Document Repository

**Files:**
- Create: `apps/api/src/modules/document/repository.ts`

- [ ] **Step 1: Create `apps/api/src/modules/document/repository.ts`**

```typescript
import { eq, sql } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { document, documentCollection } from '@/db/schema'
import type { CreateDocumentDto, UpdateDocumentDto, AddToCollectionDto } from './schema'

export async function getDocumentById(db: Db, id: number) {
  const rows = await db.select().from(document).where(eq(document.id, id)).limit(1)
  return rows[0] ?? null
}

export async function createDocument(db: Db, data: CreateDocumentDto) {
  const rows = await db.insert(document).values({
    title:            data.title,
    description:      data.description ?? null,
    content:          data.content,
    contentText:      data.contentText ?? null,
    embedding:        data.embedding ?? null,
    parentDocumentId: data.parentDocumentId ?? null,
    chunkIndex:       data.chunkIndex ?? null,
    chunkTotal:       data.chunkTotal ?? null,
    metadata:         data.metadata,
  }).returning()
  return rows[0]
}

export async function updateDocument(db: Db, id: number, data: UpdateDocumentDto) {
  // Build patch with only defined fields — use typed object so Drizzle
  // can apply customType toDriver() transformations (e.g. embedding vector)
  const patch: Partial<typeof document.$inferInsert> & { updatedAt: Date } = {
    updatedAt: new Date(),
  }
  if (data.title            !== undefined) patch.title            = data.title
  if (data.description      !== undefined) patch.description      = data.description ?? null
  if (data.content          !== undefined) patch.content          = data.content
  if (data.contentText      !== undefined) patch.contentText      = data.contentText ?? null
  if (data.embedding        !== undefined) patch.embedding        = data.embedding ?? null
  if (data.parentDocumentId !== undefined) patch.parentDocumentId = data.parentDocumentId ?? null
  if (data.chunkIndex       !== undefined) patch.chunkIndex       = data.chunkIndex ?? null
  if (data.chunkTotal       !== undefined) patch.chunkTotal       = data.chunkTotal ?? null
  if (data.metadata         !== undefined) patch.metadata         = data.metadata

  const rows = await db.update(document).set(patch).where(eq(document.id, id)).returning()
  return rows[0] ?? null
}

export async function deleteDocument(db: Db, id: number) {
  const rows = await db.delete(document).where(eq(document.id, id)).returning()
  return rows[0] ?? null
}

export async function addDocumentToCollection(db: Db, documentId: number, data: AddToCollectionDto) {
  const rows = await db.insert(documentCollection).values({
    documentId,
    collectionId: data.collectionId,
    position:     data.position ?? null,
  }).onConflictDoNothing().returning()
  return rows[0] ?? null
}

export async function removeDocumentFromCollection(db: Db, documentId: number, collectionId: number) {
  const rows = await db.delete(documentCollection)
    .where(
      sql`${documentCollection.documentId} = ${documentId}
       AND ${documentCollection.collectionId} = ${collectionId}`
    )
    .returning()
  return rows[0] ?? null
}

export async function getDocumentChunks(db: Db, parentDocumentId: number) {
  return db.select().from(document)
    .where(eq(document.parentDocumentId, parentDocumentId))
    .orderBy(document.chunkIndex)
}
```

- [ ] **Step 2: Commit**

```bash
cd /f/holon
git add apps/api/src/modules/document/repository.ts
git commit -m "feat: add document repository (CRUD + collection + chunks)"
```

---

## Task 13: Document Routes

**Files:**
- Create: `apps/api/src/modules/document/route.ts`

- [ ] **Step 1: Create `apps/api/src/modules/document/route.ts`**

```typescript
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import type { Db } from '@/db/client'
import {
  DocumentSchema, CreateDocumentSchema, UpdateDocumentSchema, AddToCollectionSchema,
} from './schema'
import * as repo from './repository'

type Env = { Variables: { db: Db } }

const router = new OpenAPIHono<Env>()

const IdParam = z.object({ id: z.coerce.number().int().positive() })
const NotFound = { description: 'Not found', content: { 'application/json': { schema: z.object({ error: z.string() }) } } }

// POST /documents
router.openapi(
  createRoute({
    method: 'post', path: '/documents',
    request: { body: { content: { 'application/json': { schema: CreateDocumentSchema } } } },
    responses: { 201: { description: 'Created', content: { 'application/json': { schema: DocumentSchema } } } },
  }),
  async (c) => {
    const body = c.req.valid('json')
    const row  = await repo.createDocument(c.var.db, body)
    return c.json(row, 201)
  }
)

// GET /documents/:id
router.openapi(
  createRoute({
    method: 'get', path: '/documents/{id}',
    request: { params: IdParam },
    responses: {
      200: { description: 'Found', content: { 'application/json': { schema: DocumentSchema } } },
      404: NotFound,
    },
  }),
  async (c) => {
    const { id } = c.req.valid('param')
    const row    = await repo.getDocumentById(c.var.db, id)
    if (!row) return c.json({ error: 'Not found' }, 404)
    return c.json(row)
  }
)

// PATCH /documents/:id
router.openapi(
  createRoute({
    method: 'patch', path: '/documents/{id}',
    request: {
      params: IdParam,
      body: { content: { 'application/json': { schema: UpdateDocumentSchema } } },
    },
    responses: {
      200: { description: 'Updated', content: { 'application/json': { schema: DocumentSchema } } },
      404: NotFound,
    },
  }),
  async (c) => {
    const { id } = c.req.valid('param')
    const body   = c.req.valid('json')
    const row    = await repo.updateDocument(c.var.db, id, body)
    if (!row) return c.json({ error: 'Not found' }, 404)
    return c.json(row)
  }
)

// DELETE /documents/:id
router.openapi(
  createRoute({
    method: 'delete', path: '/documents/{id}',
    request: { params: IdParam },
    responses: {
      200: { description: 'Deleted', content: { 'application/json': { schema: DocumentSchema } } },
      404: NotFound,
    },
  }),
  async (c) => {
    const { id } = c.req.valid('param')
    const row    = await repo.deleteDocument(c.var.db, id)
    if (!row) return c.json({ error: 'Not found' }, 404)
    return c.json(row)
  }
)

// POST /documents/:id/collections  — add to collection
router.openapi(
  createRoute({
    method: 'post', path: '/documents/{id}/collections',
    request: {
      params: IdParam,
      body: { content: { 'application/json': { schema: AddToCollectionSchema } } },
    },
    responses: {
      200: { description: 'Added', content: { 'application/json': { schema: z.object({ ok: z.boolean() }) } } },
      404: NotFound,
    },
  }),
  async (c) => {
    const { id } = c.req.valid('param')
    const body   = c.req.valid('json')
    const doc    = await repo.getDocumentById(c.var.db, id)
    if (!doc) return c.json({ error: 'Not found' }, 404)
    await repo.addDocumentToCollection(c.var.db, id, body)
    return c.json({ ok: true })
  }
)

// DELETE /documents/:id/collections/:collectionId
router.openapi(
  createRoute({
    method: 'delete', path: '/documents/{id}/collections/{collectionId}',
    request: {
      params: z.object({
        id:           z.coerce.number().int().positive(),
        collectionId: z.coerce.number().int().positive(),
      }),
    },
    responses: {
      200: { description: 'Removed', content: { 'application/json': { schema: z.object({ ok: z.boolean() }) } } },
      404: NotFound,
    },
  }),
  async (c) => {
    const { id, collectionId } = c.req.valid('param')
    const row = await repo.removeDocumentFromCollection(c.var.db, id, collectionId)
    if (!row) return c.json({ error: 'Not found' }, 404)
    return c.json({ ok: true })
  }
)

// GET /documents/:id/chunks
router.openapi(
  createRoute({
    method: 'get', path: '/documents/{id}/chunks',
    request: { params: IdParam },
    responses: {
      200: { description: 'Chunks', content: { 'application/json': { schema: z.array(DocumentSchema) } } },
    },
  }),
  async (c) => {
    const { id } = c.req.valid('param')
    const rows   = await repo.getDocumentChunks(c.var.db, id)
    return c.json(rows)
  }
)

export default router
```

- [ ] **Step 2: Commit**

```bash
cd /f/holon
git add apps/api/src/modules/document/route.ts
git commit -m "feat: add document OpenAPI routes"
```

---

## Task 14: Search Library (RRF)

**Files:**
- Create: `apps/api/src/lib/search.ts`

- [ ] **Step 1: Create `apps/api/src/lib/search.ts`**

```typescript
import { sql } from 'drizzle-orm'
import type { Db } from '@/db/client'

export interface SearchResult {
  id:          number
  title:       string
  description: string | null
  contentText: string | null
  metadata:    unknown
  score:       number
}

/**
 * Global RRF search — vector + trigram across all documents.
 * Pass null for queryEmbedding to do text-only search.
 * Pass null for queryText to do vector-only search.
 */
export async function globalSearch(
  db: Db,
  opts: {
    queryText:      string | null
    queryEmbedding: number[] | null
    limit:          number
  }
): Promise<SearchResult[]> {
  const { queryText, queryEmbedding, limit } = opts
  const k = 60

  const embeddingLiteral = queryEmbedding
    ? `'[${queryEmbedding.join(',')}]'::vector`
    : null

  // NOTE: DEMO only — raw SQL with manual escaping.
  // Production should use fully parameterised queries.
  const safeText = queryText?.replace(/'/g, "''") ?? ''

  const rows = await db.execute(sql.raw(`
    WITH vector_ranked AS (
      ${embeddingLiteral ? `
        SELECT id, RANK() OVER (ORDER BY embedding <=> ${embeddingLiteral}) AS rnk
        FROM document
        WHERE embedding IS NOT NULL
        ORDER BY embedding <=> ${embeddingLiteral}
        LIMIT 60
      ` : `SELECT NULL::int AS id, NULL::bigint AS rnk WHERE false`}
    ),
    text_ranked AS (
      ${queryText ? `
        SELECT id, RANK() OVER (ORDER BY similarity(content_text, '${safeText}') DESC) AS rnk
        FROM document
        WHERE content_text % '${safeText}'
        LIMIT 60
      ` : `SELECT NULL::int AS id, NULL::bigint AS rnk WHERE false`}
    ),
    rrf AS (
      SELECT
        COALESCE(v.id, t.id)                                          AS id,
        COALESCE(1.0 / (${k} + v.rnk), 0.0)
        + COALESCE(1.0 / (${k} + t.rnk), 0.0)                        AS score
      FROM vector_ranked v
      FULL OUTER JOIN text_ranked t USING (id)
    )
    SELECT d.id, d.title, d.description, d.content_text, d.metadata, r.score
    FROM rrf r
    JOIN document d ON d.id = r.id
    ORDER BY r.score DESC
    LIMIT ${limit}
  `))

  return rows.rows as SearchResult[]
}

/**
 * Collection-scoped RRF search — no JOIN between document and document_collection.
 * Filtering is done via = ANY(subquery).
 */
export async function collectionSearch(
  db: Db,
  opts: {
    collectionId:   number
    queryText:      string | null
    queryEmbedding: number[] | null
    limit:          number
  }
): Promise<SearchResult[]> {
  const { collectionId, queryText, queryEmbedding, limit } = opts
  const k = 60

  const embeddingLiteral = queryEmbedding
    ? `'[${queryEmbedding.join(',')}]'::vector`
    : null

  // NOTE: DEMO only — raw SQL with manual escaping.
  const safeText = queryText?.replace(/'/g, "''") ?? ''

  const rows = await db.execute(sql.raw(`
    WITH collection_ids AS (
      SELECT document_id FROM document_collection WHERE collection_id = ${collectionId}
    ),
    vector_ranked AS (
      ${embeddingLiteral ? `
        SELECT id, RANK() OVER (ORDER BY embedding <=> ${embeddingLiteral}) AS rnk
        FROM document
        WHERE id = ANY(SELECT document_id FROM collection_ids)
          AND embedding IS NOT NULL
        ORDER BY embedding <=> ${embeddingLiteral}
        LIMIT 60
      ` : `SELECT NULL::int AS id, NULL::bigint AS rnk WHERE false`}
    ),
    text_ranked AS (
      ${queryText ? `
        SELECT id, RANK() OVER (ORDER BY similarity(content_text, '${safeText}') DESC) AS rnk
        FROM document
        WHERE id = ANY(SELECT document_id FROM collection_ids)
          AND content_text % '${safeText}'
        LIMIT 60
      ` : `SELECT NULL::int AS id, NULL::bigint AS rnk WHERE false`}
    ),
    rrf AS (
      SELECT
        COALESCE(v.id, t.id)                                          AS id,
        COALESCE(1.0 / (${k} + v.rnk), 0.0)
        + COALESCE(1.0 / (${k} + t.rnk), 0.0)                        AS score
      FROM vector_ranked v
      FULL OUTER JOIN text_ranked t USING (id)
    )
    SELECT d.id, d.title, d.description, d.content_text, d.metadata, r.score
    FROM rrf r
    JOIN document d ON d.id = r.id
    ORDER BY r.score DESC
    LIMIT ${limit}
  `))

  return rows.rows as SearchResult[]
}
```

- [ ] **Step 2: Commit**

```bash
cd /f/holon
git add apps/api/src/lib/search.ts
git commit -m "feat: add RRF search library (global + collection-scoped)"
```

---

## Task 15: Search Route

**Files:**
- Create: `apps/api/src/modules/search/route.ts`

- [ ] **Step 1: Create `apps/api/src/modules/search/route.ts`**

```typescript
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import type { Db } from '@/db/client'
import { globalSearch, collectionSearch } from '@/lib/search'

type Env = { Variables: { db: Db } }

const router = new OpenAPIHono<Env>()

const SearchRequestSchema = z.object({
  q:            z.string().min(1).openapi({ description: 'Keyword query for trigram search' }),
  embedding:    z.array(z.number()).optional()
                  .openapi({ description: 'Query embedding vector (1536 dims)' }),
  collectionId: z.number().int().positive().optional()
                  .openapi({ description: 'Scope search to this collection' }),
  limit:        z.number().int().min(1).max(100).default(10),
})

const SearchResultSchema = z.object({
  id:          z.number(),
  title:       z.string(),
  description: z.string().nullable(),
  contentText: z.string().nullable(),
  metadata:    z.record(z.unknown()),
  score:       z.number(),
})

router.openapi(
  createRoute({
    method: 'post', path: '/search',
    request: { body: { content: { 'application/json': { schema: SearchRequestSchema } } } },
    responses: {
      200: {
        description: 'Search results ranked by RRF score',
        content: { 'application/json': { schema: z.array(SearchResultSchema) } },
      },
    },
  }),
  async (c) => {
    const { q, embedding, collectionId, limit } = c.req.valid('json')
    const db = c.var.db

    const results = collectionId
      ? await collectionSearch(db, { collectionId, queryText: q, queryEmbedding: embedding ?? null, limit })
      : await globalSearch(db,     {               queryText: q, queryEmbedding: embedding ?? null, limit })

    return c.json(results)
  }
)

export default router
```

- [ ] **Step 2: Commit**

```bash
cd /f/holon
git add apps/api/src/modules/search/route.ts
git commit -m "feat: add POST /search OpenAPI route"
```

---

## Task 16: Wire Up `index.ts`

**Files:**
- Modify: `apps/api/src/index.ts`

- [ ] **Step 1: Replace `apps/api/src/index.ts` with:**

```typescript
import { OpenAPIHono } from '@hono/zod-openapi'
import { swaggerUI } from '@hono/swagger-ui'
import { createDb } from '@/db/client'
import collectionRoute from '@/modules/collection/route'
import documentRoute   from '@/modules/document/route'
import searchRoute     from '@/modules/search/route'

type Bindings = { DB_URL: string }
type Variables = { db: ReturnType<typeof createDb> }

const app = new OpenAPIHono<{ Bindings: Bindings; Variables: Variables }>()

// Singleton DB pool per Worker isolate — CF Workers reuses isolates across
// requests, so module-level singleton avoids creating a new Pool every request.
let _db: ReturnType<typeof createDb> | null = null

app.use('*', async (c, next) => {
  if (!_db) _db = createDb(c.env.DB_URL)
  c.set('db', _db)
  await next()
})

app.route('/', collectionRoute)
app.route('/', documentRoute)
app.route('/', searchRoute)

app.get('/ui', swaggerUI({ url: '/doc' }))

app.doc('/doc', {
  info: { title: 'Holon API', version: 'v1' },
  openapi: '3.1.0',
})

export default app
```

- [ ] **Step 2: Delete old `apps/api/src/document/` directory (replaced by modules)**

```bash
rm -rf /f/holon/apps/api/src/document
```

- [ ] **Step 3: Commit**

```bash
cd /f/holon
git add apps/api/src/index.ts
git rm -r apps/api/src/document/
git commit -m "feat: wire up all routes and DB middleware in index.ts"
```

---

## Task 17: Smoke Test — End-to-End Demo

- [ ] **Step 1: Start the dev server**

```bash
cd /f/holon/apps/api
pnpm dev
```

Expected: wrangler dev starts on `http://localhost:8787`

- [ ] **Step 2: Create a collection**

```bash
curl -s -X POST http://localhost:8787/collections \
  -H "Content-Type: application/json" \
  -d '{"title":"AI Papers","description":"Machine learning research collection"}' | jq
```

Expected: `{"id":1,"title":"AI Papers",...}`

- [ ] **Step 3: Create a document (paper chunk)**

```bash
curl -s -X POST http://localhost:8787/documents \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Attention Is All You Need - Abstract",
    "content": {"text":"The dominant sequence transduction models are based on complex recurrent or convolutional neural networks"},
    "contentText": "Attention Is All You Need Abstract The dominant sequence transduction models are based on complex recurrent or convolutional neural networks",
    "metadata": {"doi":"1706.03762","authors":["Vaswani et al."]}
  }' | jq
```

Expected: `{"id":1,"title":"Attention Is All You Need - Abstract",...}`

- [ ] **Step 4: Add document to collection**

```bash
curl -s -X POST http://localhost:8787/documents/1/collections \
  -H "Content-Type: application/json" \
  -d '{"collectionId":1}' | jq
```

Expected: `{"ok":true}`

- [ ] **Step 5: Text search (trigram)**

```bash
curl -s -X POST http://localhost:8787/search \
  -H "Content-Type: application/json" \
  -d '{"q":"recurrent neural","limit":5}' | jq
```

Expected: the paper document appears in results with a `score` > 0.

- [ ] **Step 6: Collection-scoped search**

```bash
curl -s -X POST http://localhost:8787/search \
  -H "Content-Type: application/json" \
  -d '{"q":"recurrent neural","collectionId":1,"limit":5}' | jq
```

Expected: same document, same or similar score, scoped to collection 1.

- [ ] **Step 7: Open Swagger UI**

Navigate to `http://localhost:8787/ui` — all endpoints should appear.

- [ ] **Step 8: Final commit**

```bash
cd /f/holon
git add -A
git commit -m "feat: complete document-collection system demo"
```

---

## Summary

| Task | Deliverable |
|------|-------------|
| 1 | Docker Compose: PostgreSQL 16 + pgvector |
| 2 | `nodejs_compat` + `.dev.vars` |
| 3 | drizzle-orm, pg, drizzle-kit installed |
| 4 | Drizzle schema (3 tables) |
| 5 | DB client factory |
| 6 | SQL migration with HNSW + trigram indexes |
| 7 | Migration runner + verified DB |
| 8 | Collection Zod schemas |
| 9 | Collection repository (CRUD) |
| 10 | Collection OpenAPI routes |
| 11 | Document Zod schemas |
| 12 | Document repository (CRUD + chunks + collection) |
| 13 | Document OpenAPI routes |
| 14 | RRF search library (global + collection-scoped) |
| 15 | `POST /search` route |
| 16 | Wired `index.ts` + DB middleware |
| 17 | End-to-end smoke test |
