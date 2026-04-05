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
