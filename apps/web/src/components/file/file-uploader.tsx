import { useFileUpload } from '@/hooks/use-file-upload'
import { Button } from '@workspace/ui/components/button'
import { useRef, useState } from 'react'

const ACCEPTED_TYPES = '.pdf,image/*'

export function FileUploader() {
  const { state, upload, pause, resume, abort, reset } = useFileUpload()
  const [visibility, setVisibility] = useState<'public' | 'private'>('private')
  const [hasFile, setHasFile] = useState(false)
  const fileRef = useRef<File | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null
    fileRef.current = file
    setHasFile(file !== null)
  }

  function handleUpload() {
    if (!fileRef.current) return
    upload(fileRef.current, visibility)
  }

  function handleResume() {
    if (!fileRef.current) return
    resume(fileRef.current, visibility)
  }

  function handleAbort() {
    abort()
    if (inputRef.current) inputRef.current.value = ''
    fileRef.current = null
    setHasFile(false)
  }

  function handleReset() {
    reset()
    if (inputRef.current) inputRef.current.value = ''
    fileRef.current = null
    setHasFile(false)
  }

  const { status, progress, url, error } = state

  return (
    <div className="flex flex-col gap-4 p-4 max-w-md">
      <h2 className="text-lg font-semibold">Upload File</h2>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_TYPES}
        onChange={handleFileChange}
        disabled={status === 'uploading' || status === 'hashing'}
        className="block w-full text-sm"
      />

      <div className="flex gap-2 items-center">
        <label htmlFor="visibility" className="text-sm font-medium">Visibility:</label>
        <select
          id="visibility"
          value={visibility}
          onChange={e => setVisibility(e.target.value as 'public' | 'private')}
          disabled={status === 'uploading' || status === 'hashing'}
          className="text-sm border rounded px-2 py-1"
        >
          <option value="private">Private</option>
          <option value="public">Public</option>
        </select>
      </div>

      {/* Status display */}
      <div className="text-sm text-muted-foreground">
        Status: <span className="font-medium">{status}</span>
        {status === 'uploading' && ` — ${progress}%`}
      </div>

      {/* progress variable — ready for a <ProgressBar progress={progress} /> component */}
      {(status === 'uploading' || status === 'paused') && (
        <div className="text-xs text-muted-foreground">
          Progress: {progress} / 100
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-2 flex-wrap">
        {(status === 'idle' || status === 'error') && (
          <Button onClick={handleUpload} disabled={!hasFile}>
            Upload
          </Button>
        )}
        {status === 'uploading' && (
          <Button variant="outline" onClick={pause}>
            Pause
          </Button>
        )}
        {status === 'paused' && (
          <Button onClick={handleResume} disabled={!hasFile}>
            Resume
          </Button>
        )}
        {(status === 'uploading' || status === 'paused') && (
          <Button variant="outline" onClick={handleAbort}>
            Cancel
          </Button>
        )}
        {status === 'complete' && (
          <Button variant="outline" onClick={handleReset}>
            Upload another
          </Button>
        )}
      </div>

      {/* Result */}
      {status === 'complete' && (
        <div className="text-sm text-green-600">
          Upload complete!
          {url && (
            <a href={url} target="_blank" rel="noopener noreferrer" className="ml-2 underline">
              View file
            </a>
          )}
        </div>
      )}

      {error && (
        <div className="text-sm text-red-600">Error: {error}</div>
      )}
    </div>
  )
}
