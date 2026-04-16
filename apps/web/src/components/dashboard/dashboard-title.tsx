import { cn } from "@workspace/ui/lib/utils"



export function DashboardTitle({ className, ...props }: React.ComponentProps<'h1'>) {
    return (
        <h1 className={cn('scroll-m-20 text-4xl font-extrabold tracking-tight text-balance', className)} {...props} />
    )
}