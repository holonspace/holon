import type { createAuth } from "@/auth"

type Variables = {
    auth: ReturnType<typeof createAuth>
}

type Bindings = CloudflareBindings

type Env = {
    Bindings: Bindings
    Variables: Variables
}

export type { Bindings, Env, Variables }

