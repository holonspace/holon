# Document & Collection System Design

**Date:** 2026-04-05  
**Project:** holon / apps/api  
**Stack:** Cloudflare Workers · Hono · Drizzle ORM · PostgreSQL + pgvector

---

## Overview

A flexible document store supporting semantic vector search, trigram keyword search, and Reciprocal Rank Fusion (RRF) to combine both. Documents can belong to multiple collections; collection-scoped queries operate without JOIN via `= ANY(subquery)`.

---

## Infrastructure

- **Database:** PostgreSQL + pgvector — local Docker Compose for development
- **Runtime:** Cloudflare Workers with `nodejs_compat` flag
- **Driver:** `pg` (node-postgres) via Drizzle ORM `node-postgres` adapter
- **Connection string:** stored in `.dev.vars` (`DB_URL`) for local, Wrangler secret for production

---

## Extensions

```sql
CREATE EXTENSION IF NOT EXISTS vector;   -- pgvector
CREATE EXTENSION IF NOT EXISTS pg_trgm;  -- trigram substring/fuzzy search
```

---

## Table Design

### `collection`

```sql
CREATE TABLE collection (
  id          SERIAL       PRIMARY KEY,
  title       VARCHAR(255) NOT NULL,
  description TEXT,
  metadata    JSONB        NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);
```

`metadata` stores arbitrary business fields (tags, category, owner, etc.) without schema migration.

### `document`

```sql
CREATE TABLE document (
  id                 SERIAL       PRIMARY KEY,
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
```

**Field notes:**
- `content` — raw structured data (e.g. `{"text":"...","specs":{...}}`)
- `content_text` — application layer fills this with whatever text should be searchable (title + body + specs, etc.)
- `embedding` — semantic vector, 1536 dims default (model-agnostic, adjustable via migration)
- `parent_document_id` — self-reference for chunk trees; chunk documents point to their parent
- `chunk_index` / `chunk_total` — position within parent (0-based)
- `metadata` — arbitrary extensible fields (DOI, SKU, tags, author, etc.)

### `document_collection`

```sql
CREATE TABLE document_collection (
  document_id   INTEGER     NOT NULL REFERENCES document(id)   ON DELETE CASCADE,
  collection_id INTEGER     NOT NULL REFERENCES collection(id) ON DELETE CASCADE,
  position      INTEGER,
  added_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (document_id, collection_id)
);
```

Many-to-many junction. `position` allows ordered collections (e.g. chapter ordering).

---

## Index Design

### `document`

| Index | Type | Purpose |
|-------|------|---------|
| `embedding` | HNSW `vector_cosine_ops`, m=16, ef=64 | ANN vector search |
| `content_text` | GIN `gin_trgm_ops` | Trigram keyword/substring search |
| `metadata` | GIN | JSONB field queries |
| `parent_document_id` | Btree partial (NOT NULL) | Chunk tree traversal |
| `created_at DESC` | Btree | Time-ordered listing |

### `document_collection`

| Index | Type | Purpose |
|-------|------|---------|
| PK `(document_id, collection_id)` | Btree | Document → collections lookup |
| `(collection_id, document_id)` | Btree | Collection → documents lookup (Index Only Scan) |

### `collection`

| Index | Type | Purpose |
|-------|------|---------|
| `created_at DESC` | Btree | Time-ordered listing |
| `metadata` | GIN | JSONB field queries |

---

## Query Design

### Global Mixed Search (RRF)

Combines vector ANN + trigram similarity across all documents.

```sql
WITH vector_ranked AS (
  SELECT id, RANK() OVER (ORDER BY embedding <=> $1) AS rnk
  FROM document WHERE embedding IS NOT NULL
  ORDER BY embedding <=> $1 LIMIT 60
),
text_ranked AS (
  SELECT id, RANK() OVER (ORDER BY similarity(content_text, $2) DESC) AS rnk
  FROM document WHERE content_text % $2
  LIMIT 60
),
rrf AS (
  SELECT COALESCE(v.id, t.id) AS id,
         COALESCE(1.0/(60+v.rnk), 0.0) + COALESCE(1.0/(60+t.rnk), 0.0) AS score
  FROM vector_ranked v FULL OUTER JOIN text_ranked t USING (id)
)
SELECT d.*, r.score FROM rrf r JOIN document d ON d.id = r.id
ORDER BY r.score DESC LIMIT $3;
```

### Collection-Scoped Search (No JOIN, RRF)

Restricts search to documents within a single collection using `= ANY(subquery)`.

```sql
WITH collection_ids AS (
  SELECT document_id FROM document_collection WHERE collection_id = $1
),
vector_ranked AS (
  SELECT id, RANK() OVER (ORDER BY embedding <=> $2) AS rnk
  FROM document
  WHERE id = ANY(SELECT document_id FROM collection_ids) AND embedding IS NOT NULL
  ORDER BY embedding <=> $2 LIMIT 60
),
text_ranked AS (
  SELECT id, RANK() OVER (ORDER BY similarity(content_text, $3) DESC) AS rnk
  FROM document
  WHERE id = ANY(SELECT document_id FROM collection_ids) AND content_text % $3
  LIMIT 60
),
rrf AS (
  SELECT COALESCE(v.id, t.id) AS id,
         COALESCE(1.0/(60+v.rnk), 0.0) + COALESCE(1.0/(60+t.rnk), 0.0) AS score
  FROM vector_ranked v FULL OUTER JOIN text_ranked t USING (id)
)
SELECT d.*, r.score FROM rrf r JOIN document d ON d.id = r.id
ORDER BY r.score DESC LIMIT $4;
```

### Chunk Retrieval

```sql
SELECT * FROM document
WHERE parent_document_id = $1
ORDER BY chunk_index ASC;
```

---

## Backend Architecture

### Directory Structure

```
apps/api/src/
├── index.ts
├── db/
│   ├── client.ts          # Drizzle + pg Pool
│   ├── schema.ts          # Drizzle table definitions
│   └── migrations/        # SQL migration files
├── modules/
│   ├── collection/
│   │   ├── schema.ts      # Zod request/response schemas
│   │   ├── repository.ts  # DB query logic
│   │   └── route.ts       # Hono OpenAPI route
│   └── document/
│       ├── schema.ts
│       ├── repository.ts
│       └── route.ts
└── lib/
    └── search.ts          # RRF query helpers
```

### Zod Entities

- `DocumentSchema` — full document entity
- `CreateDocumentSchema` — create payload (title required, embedding optional)
- `UpdateDocumentSchema` — partial update
- `SearchQuerySchema` — `{ q, embedding?, collectionId?, limit }`
- Equivalent schemas for `collection`

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/collections` | Create collection |
| `GET` | `/collections` | List collections |
| `GET` | `/collections/:id` | Get collection |
| `PATCH` | `/collections/:id` | Update collection |
| `DELETE` | `/collections/:id` | Delete collection |
| `POST` | `/documents` | Create document |
| `GET` | `/documents/:id` | Get document |
| `PATCH` | `/documents/:id` | Update document |
| `DELETE` | `/documents/:id` | Delete document |
| `POST` | `/documents/:id/collections` | Add document to collection |
| `DELETE` | `/documents/:id/collections/:collectionId` | Remove from collection |
| `GET` | `/documents/:id/chunks` | Get all chunks of a document |
| `POST` | `/search` | Global or collection-scoped RRF search |
