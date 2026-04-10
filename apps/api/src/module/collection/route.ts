import { Env } from '@/types'
import { OpenAPIHono } from '@hono/zod-openapi'
import collectionDocumentsRouter from './routes/collection-documents'
import collectionParentRouter from './routes/collection-parent'
import collectionSearchRouter from './routes/collection-search'
import collectionRouter from './routes/collection'

const router = new OpenAPIHono<Env>()

// 搜尋路由必須在參數路由（/{collectionId}）之前註冊
router.route('/', collectionSearchRouter)
router.route('/', collectionRouter)
router.route('/', collectionParentRouter)
router.route('/', collectionDocumentsRouter)

export default router
