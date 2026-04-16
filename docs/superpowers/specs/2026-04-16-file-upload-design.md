# File Upload Design

**Date**: 2026-04-16  
**Scope**: `apps/api` (Cloudflare Workers + R2) + `apps/web` (React frontend)  
**Status**: Approved

---

## Overview

A file upload feature that stores files in Cloudflare R2 with public/private access control. Supports resumable multipart uploads (R2 native Multipart API) for files up to 100MB. No database records are created — R2 object metadata carries all required information.

Authentication is mocked via `X-User-Id` header (default: `"mock-user-001"`).

---

## Backend (`apps/api`)

### R2 Binding

Add to `wrangler.jsonc`:
```jsonc
"r2_buckets": [{ "binding": "FILE_BUCKET", "bucket_name": "holon-files" }]
```

Add to `src/types.ts` `Bindings`:
```ts
FILE_BUCKET: R2Bucket
```

### Module Structure

New module at `src/module/file/` following the existing pattern:
- `route.ts` — OpenAPIHono route definitions
- `schema.ts` — Zod request/response schemas
- `repository.ts` — R2 operations factory `createFileRepository(bucket)`

Register in `src/module/index.ts` and mount in `src/index.ts`.

### R2 Key Convention

```
{userId}/{fileId}/{filename}
```

Example: `mock-user-001/01HXZ.../report.pdf`

- `fileId`: UUID v7 (consistent with existing schema)
- `userId`: read from `X-User-Id` header, default `"mock-user-001"`

### R2 Custom Metadata

Stored on each R2 object:
```
x-meta-file-id:     {fileId}
x-meta-user-id:     {userId}
x-meta-visibility:  "public" | "private"
x-meta-filename:    {original filename}
x-meta-size:        {bytes as string}
```

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/files/upload/init` | Create multipart session |
| `PUT` | `/files/upload/:uploadId/parts/:partNumber` | Upload a single part (binary) |
| `GET` | `/files/upload/:uploadId/parts` | List completed parts (for resume) |
| `POST` | `/files/upload/:uploadId/complete` | Complete multipart upload |
| `DELETE` | `/files/upload/:uploadId` | Abort multipart upload |
| `GET` | `/files/:fileId` | Get access URL |
| `DELETE` | `/files/:fileId` | Delete file |

### Request / Response Schemas

#### `POST /files/upload/init`

Request:
```ts
{
  filename: string       // original filename
  contentType: string    // "application/pdf" | "image/jpeg" | "image/png" | "image/webp" | ...
  size: number           // bytes, max 104_857_600 (100MB)
  visibility: "public" | "private"
}
```

Response `201`:
```ts
{
  fileId: string         // UUID v7
  uploadId: string       // R2 multipart session ID — store in localStorage
  chunkSize: number      // fixed: 10_485_760 (10MB)
  totalParts: number     // Math.ceil(size / chunkSize)
}
```

#### `PUT /files/upload/:uploadId/parts/:partNumber`

- Body: `application/octet-stream` (raw binary)
- Header: `Content-Length` required
- `partNumber`: integer starting from **1** (R2 convention)

Response `200`:
```ts
{ partNumber: number; etag: string }
```

#### `GET /files/upload/:uploadId/parts`

Response `200`:
```ts
{
  parts: Array<{ partNumber: number; etag: string; size: number }>
}
```

#### `POST /files/upload/:uploadId/complete`

Request:
```ts
{
  fileId: string
  parts: Array<{ partNumber: number; etag: string }>
}
```

Response `200`:
```ts
{
  fileId: string
  url: string            // public permanent URL; empty string for private
  visibility: "public" | "private"
  filename: string
  contentType: string
  size: number
}
```

#### `GET /files/:fileId`

Worker reads R2 object metadata to determine visibility and userId.

| visibility | userId match | Result |
|-----------|--------------|--------|
| `public` | anyone | `302 Redirect` to R2 public URL |
| `private` | matches | `200` with `{ url: presignedUrl, expiresIn: 3600 }` |
| `private` | mismatch | `403 Forbidden` |

Presigned URL generated via R2 binding `createPresignedUrl()`, valid for 3600 seconds.

#### `DELETE /files/:fileId`

- Verifies `userId` matches object metadata
- Returns `204 No Content` on success
- Returns `403` if userId mismatch

### Allowed Content Types

```ts
const ALLOWED_CONTENT_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]
```

Validated at `POST /files/upload/init`. New types can be added without structural changes.

### Error Handling

Uses existing typed exceptions from `src/lib/errors.ts`:
- `BadRequestException` — invalid content type, size exceeds 100MB, missing fields
- `NotFoundException` — fileId / uploadId not found in R2
- `ForbiddenException` (new, extends `HTTPException`) — userId mismatch on private file

---

## Frontend (`apps/web`)

### File API Client

Location: `apps/web/src/lib/file-api.ts`

Wraps all calls to `https://api.holon.dev`. Functions:
- `initUpload(params)` → `{ fileId, uploadId, chunkSize, totalParts }`
- `uploadPart(uploadId, partNumber, chunk)` → `{ partNumber, etag }`
- `listParts(uploadId)` → `{ parts }`
- `completeUpload(uploadId, params)` → file info
- `abortUpload(uploadId)` → void
- `getFileUrl(fileId)` → `{ url }` or redirect

### Upload State Hook

Location: `apps/web/src/hooks/use-file-upload.ts`

```ts
type UploadState = {
  status: 'idle' | 'uploading' | 'paused' | 'complete' | 'error'
  progress: number        // 0–100: (completedParts.length / totalParts) * 100
  fileId: string | null
  url: string | null
  error: string | null
}
```

Hook API:
- `upload(file: File, visibility: "public" | "private")` — full upload flow
- `resume(file: File)` — read localStorage, call `GET parts`, skip completed, continue
- `pause()` — `AbortController.abort()`, persist state to localStorage
- `abort()` — call `DELETE /files/upload/:uploadId`, clear localStorage

**Progress update**: after each successful `uploadPart()` response, increment `completedParts` and recalculate `progress`.

### localStorage Schema

Key: `holon-upload:{filename}:{size}`

Value:
```ts
{
  uploadId: string
  fileId: string
  completedParts: Array<{ partNumber: number; etag: string }>
  totalParts: number
  visibility: "public" | "private"
}
```

Cleared on `complete` or `abort`.

### File Uploader Component

Location: `apps/web/src/components/file/file-uploader.tsx`

- `<input type="file" accept=".pdf,image/*">` for file selection
- Displays current `status` as text
- `progress` variable wired and ready for a progress bar UI component
- Action buttons: **Upload** / **Pause** / **Resume** / **Cancel**
- Shows final URL or error message on completion

---

## Constraints & Assumptions

- Max file size: **100MB** (enforced at init)
- Chunk size: **10MB** fixed (R2 minimum per-part is 5MB; last part may be smaller)
- R2 public bucket URL pattern: `https://pub-{accountId}.r2.dev/{key}` (configured once in env)
- Mock userId via `X-User-Id` header; real auth integration is out of scope
- No database records created — R2 metadata is the source of truth
- Progress is a numeric variable only; animated progress bar UI is out of scope
- Resumable uploads are single-device (uploadId in localStorage); cross-device resume is out of scope

---

## Out of Scope

- User authentication / registration
- RAG processing of uploaded files (chunking, embedding)
- Cross-device resume
- Animated progress bar UI
- File listing / search
