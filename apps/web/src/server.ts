import handler from '@tanstack/react-start/server-entry'
import { baseLocale, defineCustomServerStrategy, locales } from "./paraglide/runtime.js"
import { paraglideMiddleware } from './paraglide/server.js'

defineCustomServerStrategy("custom-queryParam", {
    getLocale: (request) => {
        if (!request) {
            return undefined
        }
        const locale = new URL(request.url).searchParams.get('locale')
        if (locale && locales.includes(locale as any)) {
            return locale
        }
        return baseLocale
    },
})

export default {
    fetch(req: Request): Promise<Response> {
        return paraglideMiddleware(req, () => handler.fetch(req))
    },
}
