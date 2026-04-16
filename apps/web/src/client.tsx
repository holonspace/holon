// src/client.tsx
import { StartClient } from '@tanstack/react-start/client'
import { StrictMode } from 'react'
import { hydrateRoot } from 'react-dom/client'
import { baseLocale, defineCustomClientStrategy, locales } from './paraglide/runtime'

defineCustomClientStrategy('custom-queryParam', {
    getLocale: () => {
        if (typeof window === 'undefined') return undefined
        const locale = new URL(window.location.href).searchParams.get('locale')
        if (locale && locales.includes(locale as any)) {
            return locale
        }
        return baseLocale
    },
    setLocale: (newLocale) => {
        if (typeof window !== 'undefined') {
            const hasLocale = new URL(window.location.href).searchParams.get('locale')
            if (hasLocale && locales.includes(hasLocale as any)) {
                const url = new URL(window.location.href)
                url.searchParams.set('locale', newLocale)
                window.history.pushState({}, '', url.href)
            }
        }
    }
})

hydrateRoot(
    document,
    <StrictMode>
        <StartClient />
    </StrictMode>,
)