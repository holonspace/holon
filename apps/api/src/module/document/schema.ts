import { DocumentContentSchema, DocumentMetadataSchema } from '@/db/types/document'
import { z } from 'zod'

export const CreateDocumentSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().nullable().optional(),
  content: DocumentContentSchema.nullable().optional(),
  metadata: DocumentMetadataSchema.nullable().optional(),
  collectionId: z.string().uuid().optional(),
})

export const DocumentSchema = z.object({
  id: z.uuid(),
  title: z.string().min(1).max(255),
  description: z.string().nullable().optional(),
  content: DocumentContentSchema.nullable(),
  metadata: DocumentMetadataSchema.nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export type CreateDocumentDto = z.infer<typeof CreateDocumentSchema>

export type DocumentDto = z.infer<typeof DocumentSchema>
