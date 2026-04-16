import { authClient } from "@/auth"
import { createFileRoute } from "@tanstack/react-router"
import { Button } from "@workspace/ui/components/button"
import { useEffect } from "react"

export const Route = createFileRoute("/_app/")({ component: RouteComponent })

function RouteComponent() {

  const session = authClient.useSession()
  useEffect(() => {
    console.log(session)

  }, [session])
  return (
    <div className="h-[5000px]">
      <h1 className="font-medium">Project ready!</h1>
      <p>You may now add components and start building.</p>
      <p>We&apos;ve already added the button component for you.</p>
      <Button className="mt-2">Button</Button>
    </div>
  )
}
