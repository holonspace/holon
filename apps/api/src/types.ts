import { createDB } from "@/db"
import { ChunkRepository } from "@/module/chunk/repository"
import { CollectionRepository } from "@/module/collection/repository"
import { DocumentRepository } from "@/module/document/repository"
import { SearchRepository } from "@/module/search/repository"


type Bindings = { DATABASE_URL: string; OPENAI_API_KEY: string }
type Variables = {
    db: ReturnType<typeof createDB>
    documentRepository: DocumentRepository
    chunkRepository: ChunkRepository
    searchRepository: SearchRepository
    collectionRepository: CollectionRepository
}

type Env = {
    Bindings: Bindings
    Variables: Variables
}

export {
    Bindings, Env, Variables
}

