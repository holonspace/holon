import { ChunkMetadataSchema } from '@/db/types/chunk'
import { z } from 'zod'

export const ChunkParamsSchema = z.object({
  documentId: z.uuid(),
})

export const CreateChunkSchema = z.object({
  content: z.string(),
  metadata: ChunkMetadataSchema.default({}),
})

export type CreateChunkDto = z.infer<typeof CreateChunkSchema>

export const ChunkSchema = z.object({
  id: z.uuid(),
  documentId: z.uuid(),
  position: z.number().int(),
  content: z.string(),
  metadata: ChunkMetadataSchema,
  createdAt: z.string(),
  updatedAt: z.string()
})

export type ChunkDto = z.infer<typeof ChunkSchema>
