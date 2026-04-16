
import { DashboardTitle } from '@/components/dashboard'
import { columns, DataTable } from '@/components/document'
import { FileUploader } from '@/components/file/file-uploader'
import { m } from '@/paraglide/messages'
import { createFileRoute } from '@tanstack/react-router'
import { mockPayments } from './documents.mock'

export const Route = createFileRoute('/dashboard/documents')({
  component: RouteComponent,
})



function RouteComponent() {
  return (
    <div className='p-8'>
      <DashboardTitle>{m.documents()}</DashboardTitle>
      <FileUploader/>
      <DataTable columns={columns} data={mockPayments} />
    </div>
  )
}

