import { FileUploader } from '@/components/file/file-uploader'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/dashboard/')({
  component: RouteComponent,
})

function RouteComponent() {
  return (
    <div className="p-8">
      <FileUploader />
    </div>
  )
}
