CREATE TABLE "chunk" (
	"id" serial PRIMARY KEY NOT NULL,
	"chunk_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"document_id" integer NOT NULL,
	"content" text NOT NULL,
	"embedding" vector(1536),
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "collection" (
	"id" serial PRIMARY KEY NOT NULL,
	"collection_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "collection_closure" (
	"ancestor_id" integer NOT NULL,
	"descendant_id" integer NOT NULL,
	"depth" integer NOT NULL,
	CONSTRAINT "collection_closure_ancestor_id_descendant_id_pk" PRIMARY KEY("ancestor_id","descendant_id")
);
--> statement-breakpoint
CREATE TABLE "document" (
	"id" serial PRIMARY KEY NOT NULL,
	"document_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"content" jsonb DEFAULT '{}'::jsonb,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_to_collection" (
	"document_id" integer NOT NULL,
	"collection_id" integer NOT NULL,
	CONSTRAINT "document_to_collection_collection_id_document_id_pk" PRIMARY KEY("collection_id","document_id")
);
--> statement-breakpoint
ALTER TABLE "chunk" ADD CONSTRAINT "chunk_document_id_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."document"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_closure" ADD CONSTRAINT "collection_closure_ancestor_id_collection_id_fk" FOREIGN KEY ("ancestor_id") REFERENCES "public"."collection"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_closure" ADD CONSTRAINT "collection_closure_descendant_id_collection_id_fk" FOREIGN KEY ("descendant_id") REFERENCES "public"."collection"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_to_collection" ADD CONSTRAINT "document_to_collection_document_id_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."document"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_to_collection" ADD CONSTRAINT "document_to_collection_collection_id_collection_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collection"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chunk_id_idx" ON "chunk" USING btree ("chunk_id");--> statement-breakpoint
CREATE INDEX "chunk_document_id_idx" ON "chunk" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "chunk_embedding_idx" ON "chunk" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "chunk_trgm_idx" ON "chunk" USING gin ("content" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "collection_id_idx" ON "collection" USING btree ("collection_id");--> statement-breakpoint
CREATE INDEX "collection_closure_descendant_idx" ON "collection_closure" USING btree ("descendant_id");--> statement-breakpoint
CREATE INDEX "document_id_idx" ON "document" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "dtc_document_id_idx" ON "document_to_collection" USING btree ("document_id");