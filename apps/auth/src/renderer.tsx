import { reactRenderer } from '@hono/react-renderer'
import { ThemeScript } from '@workspace/ui/components/theme'
import { Link, ReactRefresh, Script, ViteClient } from 'vite-ssr-components/react'

declare module '@hono/react-renderer' {
  interface Props {
    page?: string
  }
}

export const renderer = reactRenderer(({ children, page }) => {
  return (
    <html>
      <head>
        <ViteClient />
        <ReactRefresh />
        <Script src="/src/client.tsx" />
        <Link href="/src/style.css" rel="stylesheet" />
        <ThemeScript />
      </head>
      <body>
        <div id="root" data-page={page}>{children}</div>
      </body>
    </html>
  )
})
