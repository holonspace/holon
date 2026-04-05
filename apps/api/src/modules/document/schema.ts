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
