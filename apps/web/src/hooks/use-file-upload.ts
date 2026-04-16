import { computeFileHash } from '@/lib/file-hash'
import { fileApi } from '@/lib/file-api'
import type { CompleteUploadResult } from '@/lib/file-api'
import { useCallback, useRef, useState } from 'react'

export type UploadStatus = 'idle' | 'hashing' | 'uploading' | 'paused' | 'complete' | 'error'

export type UploadState = {
  status: UploadStatus
  /** 0–100: percentage of parts uploaded */
  progress: number
  /** SHA-256 sampled hash of the file, set after hashing completes */
  fileId: string | null
  /** Final URL (public files only); empty string for private */
  url: string | null
  error: string | null
}

const INITIAL_STATE: UploadState = {
  status: 'idle',
  progress: 0,
  fileId: null,
  url: null,
  error: null,
}

export function useFileUpload() {
  const [state, setState] = useState<UploadState>(INITIAL_STATE)
  const abortRef = useRef<AbortController | null>(null)
  const hashRef = useRef<string | null>(null)

  const reset = useCallback(() => {
    setState(INITIAL_STATE)
    hashRef.current = null
  }, [])

  const upload = useCallback(async (
    file: File,
    visibility: 'public' | 'private',
  ) => {
    try {
      // 1. Hash
      setState(s => ({ ...s, status: 'hashing', error: null }))
      const hash = await computeFileHash(file)
      hashRef.current = hash
      setState(s => ({ ...s, fileId: hash }))

      // 2. Start (new or resume)
      const session = await fileApi.startUpload({
        hash,
        filename: file.name,
        contentType: file.type || 'application/octet-stream',
        size: file.size,
        visibility,
      })

      const { chunkSize, totalParts, completedParts } = session
      const doneParts = [...completedParts]

      setState(s => ({
        ...s,
        status: 'uploading',
        progress: Math.round((doneParts.length / totalParts) * 100),
      }))

      // 3. Upload remaining parts
      abortRef.current = new AbortController()

      for (let partNumber = session.startFrom; partNumber <= totalParts; partNumber++) {
        const start = (partNumber - 1) * chunkSize
        const end = Math.min(start + chunkSize, file.size)
        const chunk = await file.slice(start, end).arrayBuffer()

        const result = await fileApi.uploadPart(hash, partNumber, chunk, abortRef.current.signal)
        doneParts.push(result)

        setState(s => ({
          ...s,
          progress: Math.round((doneParts.length / totalParts) * 100),
        }))
      }

      // 4. Complete
      const completed: CompleteUploadResult = await fileApi.completeUpload(hash, doneParts)
      setState({
        status: 'complete',
        progress: 100,
        fileId: hash,
        url: completed.url || null,
        error: null,
      })
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        setState(s => ({ ...s, status: 'paused' }))
      } else {
        setState(s => ({
          ...s,
          status: 'error',
          error: err instanceof Error ? err.message : 'Upload failed',
        }))
      }
    }
  }, [])

  const pause = useCallback(() => {
    abortRef.current?.abort()
    // status is set to 'paused' by the AbortError catch in upload()
  }, [])

  const resume = useCallback(async (
    file: File,
    visibility: 'public' | 'private',
  ) => {
    // Re-run upload — startUpload will detect existing state in R2 and return startFrom > 1
    await upload(file, visibility)
  }, [upload])

  const abort = useCallback(async (file: File) => {
    abortRef.current?.abort()
    try {
      setState(s => ({ ...s, status: 'idle', error: null }))
      if (hashRef.current) {
        await fileApi.abortUpload(hashRef.current)
      } else {
        // Need to hash first to get the key
        const hash = await computeFileHash(file)
        await fileApi.abortUpload(hash)
      }
      hashRef.current = null
    } catch {
      // Ignore abort errors
    }
    setState(INITIAL_STATE)
  }, [])

  return { state, upload, pause, resume, abort, reset }
}
