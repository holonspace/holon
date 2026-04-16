import { createDB } from "@/db"
import { ChunkRepository } from "@/module/chunk/repository"
import { CollectionRepository } from "@/module/collection/repository"
import { DocumentRepository } from "@/module/document/repository"
import { FileRepository } from "@/module/file/repository"
import { SearchRepository } from "@/module/search/repository"

type Bindings = {
  DATABASE_URL: string
  OPENAI_API_KEY: string
  FILE_BUCKET: R2Bucket
  PUBLIC_R2_BASE_URL: string   // e.g. "https://pub-xxx.r2.dev" for public bucket
  FILE_SIGNING_SECRET: string  // random string, e.g. openssl rand -hex 32
}

type Variables = {
  db: ReturnType<typeof createDB>
  documentRepository: DocumentRepository
  chunkRepository: ChunkRepository
  searchRepository: SearchRepository
  collectionRepository: CollectionRepository
  fileRepository: FileRepository
}

type Env = {
  Bindings: Bindings
  Variables: Variables
}

export { Bindings, Env, Variables }
