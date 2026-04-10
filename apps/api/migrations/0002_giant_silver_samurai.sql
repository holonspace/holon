ALTER TABLE "collection" ADD COLUMN "embedding" vector(1536);--> statement-breakpoint
CREATE INDEX "collection_embedding_idx" ON "collection" USING hnsw ("embedding" vector_cosine_ops);