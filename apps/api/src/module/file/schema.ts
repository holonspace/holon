import { z } from 'zod'

export const ALLOWED_CONTENT_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
] as const

export const CHUNK_SIZE = 10_485_760 // 10MB
export const MAX_FILE_SIZE = 104_857_600 // 100MB

// ─── Upload Start ─────────────────────────────────────────────────────────────

export const StartUploadSchema = z.object({
  hash: z.string().min(64).max(64),           // SHA-256 hex
  filename: z.string().min(1).max(255),
  contentType: z.enum(ALLOWED_CONTENT_TYPES),
  size: z.number().int().min(1).max(MAX_FILE_SIZE),
  visibility: z.enum(['public', 'private']),
})

export const UploadedPartSchema = z.object({
  partNumber: z.number().int().min(1),
  etag: z.string(),
})

export const StartUploadResponseSchema = z.object({
  uploadId: z.string(),
  chunkSize: z.number(),
  totalParts: z.number(),
  completedParts: z.array(UploadedPartSchema),
  startFrom: z.number().int().min(1),
})

// ─── Upload Part ──────────────────────────────────────────────────────────────

export const UploadPartResponseSchema = z.object({
  partNumber: z.number().int().min(1),
  etag: z.string(),
})

// ─── Complete Upload ──────────────────────────────────────────────────────────

export const CompleteUploadSchema = z.object({
  hash: z.string().min(64).max(64),
  parts: z.array(UploadedPartSchema).min(1),
})

export const CompleteUploadResponseSchema = z.object({
  fileId: z.string(),
  url: z.string(),
  visibility: z.enum(['public', 'private']),
  filename: z.string(),
  contentType: z.string(),
  size: z.number(),
})

// ─── File Access ──────────────────────────────────────────────────────────────

export const GetFileResponseSchema = z.object({
  url: z.string(),
  expiresIn: z.number().optional(),  // seconds, only for private files
  visibility: z.enum(['public', 'private']),
})

// ─── R2 State Object (stored in R2, not exposed to clients) ──────────────────

export type UploadState = {
  uploadId: string
  filename: string
  contentType: string
  size: number
  visibility: 'public' | 'private'
  completedParts: Array<{ partNumber: number; etag: string }>
}

// ─── DTO types ────────────────────────────────────────────────────────────────

export type StartUploadDto = z.infer<typeof StartUploadSchema>
export type CompleteUploadDto = z.infer<typeof CompleteUploadSchema>
export type UploadedPartDto = z.infer<typeof UploadedPartSchema>
