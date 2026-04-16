import type { CompleteUploadResult } from '@/lib/file-api'
import { computeFileHash } from '@/lib/file-hash'
import { fileApi } from '@/lib/file-api'
import { useCallback, useRef, useState } from 'react'

export type UploadStatus = 'idle' | 'hashing' | 'uploading' | 'paused' | 'complete' | 'error'

export type UploadState = {
  status: UploadStatus
  /**
   * 0–100: percentage of parts uploaded.
   * Remains 0 during 'hashing' and 'idle' phases.
   */
  progress: number
  /** SHA-256 sampled hash of the file, set after hashing completes */
  fileId: string | null
  /** Final URL (public files only); null for private or incomplete uploads */
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
  const isRunningRef = useRef(false)
  const isAbortingRef = useRef(false)

  const reset = useCallback(() => {
    setState(INITIAL_STATE)
    hashRef.current = null
  }, [])

  const upload = useCallback(async (
    file: File,
    visibility: 'public' | 'private',
    existingHash?: string,  // provided by resume() to skip rehashing
  ) => {
    // Guard against concurrent invocations
    if (isRunningRef.current) return
    isRunningRef.current = true
    isAbortingRef.current = false

    // Initialize AbortController before any async work so pause() works immediately
    abortRef.current = new AbortController()

    try {
      let hash: string

      if (existingHash) {
        hash = existingHash
        hashRef.current = hash
        setState(s => ({ ...s, fileId: hash, error: null }))
      } else {
        // 1. Hash
        setState(s => ({ ...s, status: 'hashing', error: null }))
        hash = await computeFileHash(file)
        hashRef.current = hash
        setState(s => ({ ...s, fileId: hash }))
      }

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

      // 4. Complete — sort parts to ensure correct order
      const sortedParts = [...doneParts].sort((a, b) => a.partNumber - b.partNumber)
      const completed: CompleteUploadResult = await fileApi.completeUpload(hash, sortedParts)
      setState({
        status: 'complete',
        progress: 100,
        fileId: hash,
        url: completed.url || null,
        error: null,
      })
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        // Only set 'paused' if this was a pause(), not an abort() call
        if (!isAbortingRef.current) {
          setState(s => ({ ...s, status: 'paused' }))
        }
        // If isAbortingRef is true, abort() will handle the state reset
      } else {
        setState(s => ({
          ...s,
          status: 'error',
          error: err instanceof Error ? err.message : 'Upload failed',
        }))
      }
    } finally {
      isRunningRef.current = false
    }
  }, [])

  const pause = useCallback(() => {
    // Note: if called during 'hashing' phase, AbortController is already set
    // but computeFileHash does not support cancellation — hashing will complete
    // before the upload stops.
    abortRef.current?.abort()
    // status is set to 'paused' by the AbortError catch in upload()
  }, [])

  const resume = useCallback(async (
    file: File,
    visibility: 'public' | 'private',
  ) => {
    // Pass existing hash to skip rehashing
    await upload(file, visibility, hashRef.current ?? undefined)
  }, [upload])

  const abort = useCallback(async () => {
    // Guard: if nothing was started, nothing to clean up server-side
    if (!hashRef.current) {
      setState(INITIAL_STATE)
      return
    }

    isAbortingRef.current = true
    abortRef.current?.abort()

    const hashToAbort = hashRef.current
    hashRef.current = null

    try {
      await fileApi.abortUpload(hashToAbort)
    } catch {
      // Ignore errors — server may have already cleaned up
    }

    setState(INITIAL_STATE)
    isAbortingRef.current = false
  }, [])

  return { state, upload, pause, resume, abort, reset }
}
