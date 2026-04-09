import { CreateDocumentSchema, DocumentDto, DocumentSchema } from '@/module/document/schema'
import { Env } from '@/types'
import { createRoute, OpenAPIHono } from '@hono/zod-openapi'

const router = new OpenAPIHono<Env>()

// POST /documents  — create document
router.openapi(
    createRoute({
        tags: ['Document'],
        summary: 'Create a document',
        description: 'Create a new document with optional content blocks and metadata. Returns the created document with a generated UUID.',
        method: 'post', path: '/documents',
        request: {
            body: { content: { 'application/json': { schema: CreateDocumentSchema } } },
        },
        responses: { 201: { description: 'Document created successfully', content: { 'application/json': { schema: DocumentSchema } } } },
    }),
    async (c) => {
        const body = c.req.valid('json')
        const documentRepository = c.get('documentRepository')
        const document = await documentRepository.createDocument(body)
     
        const documentDto: DocumentDto = {
            id: document.documentId,
            title: document.title,
            description: document.description,
            content: document.content,
            metadata: document.metadata,
            createdAt: document.createdAt.toISOString(),
            updatedAt: document.updatedAt.toISOString(),
        }
        return c.json(documentDto, 201)
    }
)

export default router
