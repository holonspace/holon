import { StrictMode } from 'react'
import { hydrateRoot } from 'react-dom/client'

type PageModule = {
  default?: React.ComponentType
  [key: string]: unknown
}

const pages = import.meta.glob<PageModule>('./page/*.tsx', { eager: true })

function resolveComponent(mod: PageModule): React.ComponentType | null {
  if (typeof mod.default === 'function') return mod.default
  for (const key of Object.keys(mod)) {
    if (key !== 'default' && typeof mod[key] === 'function') {
      return mod[key] as React.ComponentType
    }
  }
  return null
}

const pageMap = new Map<string, React.ComponentType>()
for (const [path, mod] of Object.entries(pages)) {
  const name = path.replace(/^\.\/page\//, '').replace(/\.tsx$/, '')
  const Component = resolveComponent(mod)
  if (Component) pageMap.set(name, Component)
}

const root = document.getElementById('root')
if (!root) {
  console.error('[client] #root element not found')
} else {
  const pageName = root.dataset.page
  if (!pageName) {
    console.error('[client] data-page attribute missing on #root')
  } else {
    const Component = pageMap.get(pageName)
    if (!Component) {
      console.error(`[client] No component for page: "${pageName}". Available: ${[...pageMap.keys()].join(', ')}`)
    } else {
      hydrateRoot(root, <StrictMode><Component /></StrictMode>)
    }
  }
}
