# File Upload Design

**Date**: 2026-04-16  
**Scope**: `apps/api` (Cloudflare Workers + R2) + `apps/web` (React frontend)  
**Status**: Approved

---

## Overview

A file upload feature that stores files in Cloudflare R2 with public/private access control. Supports resumable multipart uploads (R2 native Multipart API) for files up to 100MB.

**Key design principles:**
- `fileId` = SHA-256 hash of file content, computed client-side — no server-generated IDs
- No `localStorage` — resume state is stored in R2 as a `.upload-state` JSON object, enabling cross-device resume per user
- A single `POST /files/upload/start` endpoint handles both "new upload" and "resume" — frontend always calls it first, backend returns where to continue from
- Multi-user safety: state key scoped by `{userId}/{hash}`, so two users uploading the same file have independent sessions

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

**File object** (written on complete):
```
{userId}/{hash}/{filename}
```

**Upload state object** (written on start, deleted on complete/abort):
```
{userId}/{hash}/.upload-state
```

Example: `mock-user-001/a3f9c.../report.pdf` and `mock-user-001/a3f9c.../.upload-state`

- `hash`: SHA-256 hex string computed by the frontend from file content — serves as `fileId`
- `userId`: read from `X-User-Id` header, default `"mock-user-001"`

### Upload State Object Schema

Stored as JSON at `{userId}/{hash}/.upload-state`:
```ts
{
  uploadId: string        // R2 multipart session ID
  filename: string
  contentType: string
  size: number
  visibility: "public" | "private"
}
```

Completed parts are tracked by R2 itself (via `multipartUpload.listParts()`), not duplicated here.

### R2 Custom Metadata

Stored on the final file R2 object at `completeMultipartUpload`:
```
x-meta-user-id:     {userId}
x-meta-visibility:  "public" | "private"
x-meta-filename:    {original filename}
x-meta-size:        {bytes as string}
```

`fileId` is the hash, derived directly from the R2 key — no need to store separately.

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/files/upload/start` | Check or create multipart session; returns resume point |
| `PUT` | `/files/upload/:uploadId/parts/:partNumber` | Upload a single part (binary) |
| `POST` | `/files/upload/:uploadId/complete` | Complete multipart upload |
| `DELETE` | `/files/upload/:uploadId` | Abort multipart upload |
| `GET` | `/files/:fileId` | Get access URL |
| `DELETE` | `/files/:fileId` | Delete file |

### Request / Response Schemas

#### `POST /files/upload/start`

This is the single entry point for all uploads — new or resumed.

Request:
```ts
{
  hash: string           // SHA-256 hex of full file content (computed client-side)
  filename: string
  contentType: string    // "application/pdf" | "image/jpeg" | "image/png" | "image/webp" | ...
  size: number           // bytes, max 104_857_600 (100MB)
  visibility: "public" | "private"
}
```

Backend logic:
1. Derive state key: `{userId}/{hash}/.upload-state`
2. Try `bucket.get(stateKey)`:
   - **Found**: read `uploadId`, call `resumeMultipartUpload(fileKey, uploadId).listParts()` to get completed parts
   - **Not found**: call `createMultipartUpload(fileKey, { customMetadata, httpMetadata })`, write new state object

Response `200`:
```ts
{
  uploadId: string
  chunkSize: number               // fixed: 10_485_760 (10MB)
  totalParts: number              // Math.ceil(size / chunkSize)
  completedParts: Array<{ partNumber: number; etag: string }>
  startFrom: number               // next partNumber to upload (completedParts.length + 1, or 1 if new)
}
```

Frontend uses `completedParts` to skip already-uploaded parts and starts from `startFrom`.

---

#### `PUT /files/upload/:uploadId/parts/:partNumber`

- Body: `application/octet-stream` (raw binary)
- Header: `Content-Length` required
- `partNumber`: integer starting from **1** (R2 convention)
- Worker calls `resumeMultipartUpload(fileKey, uploadId).uploadPart(partNumber, body)`

Request also requires `hash` and `userId` to reconstruct the R2 file key:
- Passed as query params: `?hash={hash}` (userId from `X-User-Id` header)

Response `200`:
```ts
{ partNumber: number; etag: string }
```

---

#### `POST /files/upload/:uploadId/complete`

Request:
```ts
{
  hash: string
  parts: Array<{ partNumber: number; etag: string }>
}
```

Backend:
1. Call `resumeMultipartUpload(fileKey, uploadId).complete(parts)`
2. Delete `.upload-state` object: `bucket.delete(stateKey)`

Response `200`:
```ts
{
  fileId: string          // the hash
  url: string             // public permanent URL; empty string for private
  visibility: "public" | "private"
  filename: string
  contentType: string
  size: number
}
```

---

#### `DELETE /files/upload/:uploadId`

Query params: `?hash={hash}`

Backend:
1. Call `resumeMultipartUpload(fileKey, uploadId).abort()`
2. Delete `.upload-state` object

Response `204 No Content`

---

#### `GET /files/:fileId`

`:fileId` is the SHA-256 hash. Worker reads R2 object at `{userId}/{hash}/{filename}`.

Since R2 keys include `filename`, the Worker lists objects with prefix `{userId}/{hash}/` to find the file, then reads metadata.

| visibility | userId match | Result |
|-----------|--------------|--------|
| `public` | anyone | `302 Redirect` to R2 public URL |
| `private` | matches | `200` with `{ url: presignedUrl, expiresIn: 3600 }` |
| `private` | mismatch | `403 Forbidden` |

Presigned URL generated via R2 binding `createPresignedUrl()`, valid for 3600 seconds.

---

#### `DELETE /files/:fileId`

- Lists prefix `{userId}/{hash}/`, verifies `userId` matches object metadata
- Deletes file object
- Returns `204 No Content`, or `403` if userId mismatch

---

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

Validated at `POST /files/upload/start`. New types can be added without structural changes.

### Error Handling

Uses existing typed exceptions from `src/lib/errors.ts`:
- `BadRequestException` — invalid content type, size exceeds 100MB, missing fields
- `NotFoundException` — fileId / uploadId not found in R2
- `ForbiddenException` (new, extends `HTTPException`) — userId mismatch on private file

---

## Frontend (`apps/web`)

### File Hash Computation

Location: `apps/web/src/lib/file-hash.ts`

```ts
async function computeFileHash(file: File): Promise<string>
```

Uses a **sampled hash** strategy to keep computation near-instant regardless of file size:

1. Read **head**: bytes `0` → `2MB`
2. Read **tail**: bytes `(size - 2MB)` → `size`
3. Read **4 evenly-spaced middle samples**: each 512KB, starting at `size * 0.2`, `0.4`, `0.6`, `0.8`
4. Concatenate samples + `fileSize (uint64 LE)` + `filename (UTF-8)` into a single `ArrayBuffer`
5. Compute `SHA-256` via Web Crypto API, return lowercase hex string

Total bytes read: **~6MB fixed**, regardless of file size. Suitable for files from KB to multiple GB.

**Collision risk**: negligible for resume/deduplication purposes (not a cryptographic guarantee). Two different files with identical sampled content + size + name would collide — acceptable trade-off.

Called once before `POST /files/upload/start`. Status transitions to `'hashing'` while running.

### File API Client

Location: `apps/web/src/lib/file-api.ts`

Wraps all calls to `https://api.holon.dev`:
- `startUpload(params)` → `{ uploadId, chunkSize, totalParts, completedParts, startFrom }`
- `uploadPart(uploadId, hash, partNumber, chunk)` → `{ partNumber, etag }`
- `completeUpload(uploadId, hash, parts)` → file info
- `abortUpload(uploadId, hash)` → void
- `getFileUrl(fileId)` → `{ url }` or redirect

### Upload State Hook

Location: `apps/web/src/hooks/use-file-upload.ts`

```ts
type UploadState = {
  status: 'idle' | 'hashing' | 'uploading' | 'paused' | 'complete' | 'error'
  progress: number        // 0–100: (completedParts.length / totalParts) * 100
  fileId: string | null   // SHA-256 hash, set after hashing
  url: string | null
  error: string | null
}
```

Hook API:
- `upload(file: File, visibility: "public" | "private")` — hash file → call `start` → upload remaining parts → complete
- `pause()` — `AbortController.abort()` on the current part fetch; state remains in R2
- `resume(file: File, visibility: "public" | "private")` — re-hash file → call `start` → server returns `completedParts` → continue from `startFrom`
- `abort(file: File)` — hash file → call `DELETE /files/upload/:uploadId`, passing hash to reconstruct key

**Progress update**: `progress = (completedParts.length / totalParts) * 100`, updated after each successful `uploadPart()`.

**`status: 'hashing'`**: set while `computeFileHash()` is running, so the UI can show a spinner before upload begins.

### File Uploader Component

Location: `apps/web/src/components/file/file-uploader.tsx`

- `<input type="file" accept=".pdf,image/*">` for file selection
- Displays current `status` text (hashing / uploading / paused / complete / error)
- `progress` variable wired and ready for a progress bar UI component
- Action buttons: **Upload** / **Pause** / **Resume** / **Cancel**
- Shows final URL or error message on completion

---

## Constraints & Assumptions

- Max file size: **100MB** (enforced at `start`)
- Chunk size: **10MB** fixed (R2 minimum per-part is 5MB; last part may be smaller)
- `fileId` is a SHA-256 hex hash computed from a **sampled subset** of file content (head 2MB + tail 2MB + 4×512KB middle samples + fileSize + filename) — near-instant regardless of file size, deterministic, no server ID generation needed
- R2 public bucket URL pattern: `https://pub-{accountId}.r2.dev/{key}` (configured once in `PUBLIC_R2_BASE_URL` env var)
- Mock userId via `X-User-Id` header; real auth integration is out of scope
- No database records created — R2 metadata + state object are the source of truth
- Resume state stored in R2 (not localStorage) — works across devices for the same userId
- Progress is a numeric variable only; animated progress bar UI is out of scope
- Two users uploading the same file get independent multipart sessions (scoped by `{userId}/{hash}`)

---

## Out of Scope

- User authentication / registration
- RAG processing of uploaded files (chunking, embedding)
- Animated progress bar UI
- File listing / search
