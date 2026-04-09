ALTER TABLE "chunk" ADD COLUMN "position" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "chunk" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "document" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
CREATE INDEX "chunk_deleted_at_idx" ON "chunk" USING btree ("deleted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "chunk_doc_position_idx" ON "chunk" USING btree ("document_id","position");--> statement-breakpoint
CREATE INDEX "document_deleted_at_idx" ON "document" USING btree ("deleted_at");