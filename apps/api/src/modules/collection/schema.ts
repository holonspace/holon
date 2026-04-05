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
