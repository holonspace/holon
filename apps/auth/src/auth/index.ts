import * as schema from "@/db"
import type { IncomingRequestCfProperties, KVNamespace } from "@cloudflare/workers-types"
import { betterAuth } from "better-auth"
import { cloudflare, createKVStorage } from "better-auth-cloudflare"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { bearer, lastLoginMethod, oneTap, openAPI } from "better-auth/plugins"
import { drizzle } from "drizzle-orm/d1"

// Single auth configuration that handles both CLI and runtime scenarios
function createAuth(env?: CloudflareBindings, cf?: IncomingRequestCfProperties) {
    // Use actual DB for runtime, empty object for CLI

    const db = drizzleAdapter(env ? drizzle(env.DATABASE, { schema, logger: true }) : ({} as any), {
        provider: "sqlite",
        usePlural: true,
        // debugLogs: true,
    })

    return betterAuth({
        database: db,
        databaseHooks: {
            user: {
                create: {
                    before: async (user) => {
                        if (user.name === "") {
                            const name = user.email.split("@")[0] || ""
                            return { data: { ...user, name } }
                        }
                        return { data: { ...user } }
                    },
                }
            }
        },
        socialProviders: {
            google: {
                clientId: env?.GOOGLE_CLIENT_ID!,
                clientSecret: env?.GOOGLE_CLIENT_SECRET!,
            },
            // github: {
            //     clientId: env.GITHUB_CLIENT_ID,
            //     clientSecret: env.GITHUB_CLIENT_SECRET,
            // },
            // discord: {
            //     clientId: env.DISCORD_CLIENT_ID,
            //     clientSecret: env.DISCORD_CLIENT_SECRET,
            // }
        },
        // user: {
        //     additionalFields: {
        //         ...fields
        //     }
        // },
        secondaryStorage: env?.AUTH_SESSION ? createKVStorage(env.AUTH_SESSION as KVNamespace) : undefined,
        trustedOrigins: env?.ALLOWED_ORIGINS ? env.ALLOWED_ORIGINS.split(",") : [],
        advanced: {
            ipAddress: {
                ipAddressHeaders: ["cf-connecting-ip", "x-real-ip"],
            },
            cookiePrefix: "holon",
            crossSubDomainCookies: {
                enabled: true,
                domain: env?.CROSS_SUB_DOMAIN,
            },
        },
        baseURL: env?.BETTER_AUTH_URL,
        // emailAndPassword: {
        //     enabled: true,
        //     resetPassword: {
        //         enabled: true,
        //     },
        //     sendResetPassword: async (token, user) => {
        //         console.log("sendResetPassword", token, user)
        //     }
        // },
        plugins: [
            // better auth plugins
            openAPI(),
            bearer(),
            oneTap(),
            lastLoginMethod(),
            // cloudflare plugins
            cloudflare({
                autoDetectIpAddress: true,
                geolocationTracking: true,
                cf: cf || {},
            }),
            // holon plugins
        ],
        hooks: {
            // before: createAuthMiddleware(async (ctx) => {
            //     if (ctx.path === "/email-otp/send-verification-otp") {
            //         await checkEmailCooldown(ctx, ctx.body.email)
            //     }
            // }),
        },
        // rateLimit: {
        //     enabled: true,
        //     window: 60, // Minimum KV TTL is 60s
        //     max: 100, // reqs/window
        //     customRules: {
        //         // https://github.com/better-auth/better-auth/issues/5452
        //         "/sign-in/email": {
        //             window: 60,
        //             max: 5,
        //         },
        //         "/sign-in/social": {
        //             window: 60,
        //             max: 100,
        //         },
        //         "/check-email": {
        //             window: 60,
        //             max: 100,
        //         },
        //         "/email-otp/send-verification-otp": {
        //             window: 60,
        //             max: 100,
        //         }
        //     },
        // }
    })
}

// Export for CLI schema generation
export const auth = createAuth()

// Export for runtime usage
export { createAuth }

