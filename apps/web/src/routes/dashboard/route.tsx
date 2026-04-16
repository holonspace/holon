
import { DashboardHeader } from '@/components/dashboard'
import { createFileRoute, Link, Outlet } from '@tanstack/react-router'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger
} from '@workspace/ui/components/sidebar'
import { Boxes, File, type LucideIcon } from 'lucide-react'

export const Route = createFileRoute('/dashboard')({
  component: LayoutComponent,
})

const headerHeight = 48
const navMain = [
  {
    title: "Documents",
    url: "/dashboard/documents",
    icon: File,
  },
  {
    title: "Collections",
    url: "/dashboard/collections",
    icon: Boxes,
  },
]

function LayoutComponent() {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <DashboardHeader />
        <Outlet />
      </SidebarInset>
    </SidebarProvider>
  )
}

function AppSidebar() {
  return (
    <Sidebar collapsible='icon'>
      <SidebarHeader>
        <SidebarTrigger className="size-10 [&>svg]:size-6! cursor-ew-resize" />
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={navMain} />
      </SidebarContent>
      <SidebarFooter />
    </Sidebar>
  )
}

export function NavMain({
  items,
}: {
  items: {
    title: string
    url: string
    icon?: LucideIcon
    isActive?: boolean
    items?: {
      title: string
      url: string
    }[]
  }[]
}) {
  return (
    <SidebarGroup>
      <SidebarGroupLabel>
        Repository
      </SidebarGroupLabel>
      <SidebarMenu>
        {items.map((item) => (
          <SidebarMenuItem>
            <SidebarMenuButton tooltip={item.title} className='h-10' render={(props) => <Link to={item.url} {...props} />}>
              {item.icon && <item.icon />}
              <span className='text-base'>{item.title}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </SidebarGroup>
  )
}
