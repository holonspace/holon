import { z } from 'zod'

// ── Request Schemas ────────────────────────────────────────────────────────────

export const CreateCollectionSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional()
})

export const UpdateCollectionSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
})

export const CollectionParamsSchema = z.object({
  collectionId: z.uuid(),
})

export const CollectionQuerySchema = z.object({
  collectionId: z.string().uuid().optional(),
})

// ── Response Schema ────────────────────────────────────────────────────────────

export const CollectionSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  description: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

// ── Move Operations ────────────────────────────────────────────────────────────

export const MoveToParentSchema = z.object({
  parentId: z.uuid(),
})

// ── Document-Collection Operations ────────────────────────────────────────────

export const AddDocumentToCollectionSchema = z.object({
  documentId: z.string().uuid(),
})

export const ListDocumentsQuerySchema = z.object({
  recursive: z
    .string()
    .optional()
    .transform((v) => v === 'true')
    .openapi({ type: 'boolean', description: '若為 true，包含所有子 collection 的文件' }),
})

export const DocumentCollectionParamsSchema = z.object({
  collectionId: z.string().uuid(),
  documentId: z.string().uuid(),
})

// ── Collection Search ──────────────────────────────────────────────────────────

export const CollectionSearchBodySchema = z.object({
  query: z.string().min(1),
  limit: z.number().int().min(1).max(100).optional(),
})

export const CollectionSearchResultSchema = CollectionSchema.extend({
  score: z.number().openapi({ description: 'Cosine similarity score (0~1, higher = more relevant)' }),
})

export const DocumentSummarySchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  description: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
  content: z.record(z.string(), z.unknown()).nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

// ── DTO Types ──────────────────────────────────────────────────────────────────

export type CollectionSearchBodyDto   = z.infer<typeof CollectionSearchBodySchema>
export type CollectionSearchResultDto = z.infer<typeof CollectionSearchResultSchema>
export type CreateCollectionDto = z.infer<typeof CreateCollectionSchema>
export type UpdateCollectionDto = z.infer<typeof UpdateCollectionSchema>
export type CollectionDto = z.infer<typeof CollectionSchema>
export type MoveToParentDto = z.infer<typeof MoveToParentSchema>
export type AddDocumentToCollectionDto = z.infer<typeof AddDocumentToCollectionSchema>
export type ListDocumentsQueryDto = z.infer<typeof ListDocumentsQuerySchema>
export type DocumentSummaryDto = z.infer<typeof DocumentSummarySchema>
