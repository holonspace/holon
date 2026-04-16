import { paraglideVitePlugin } from "@inlang/paraglide-js"
import tailwindcss from "@tailwindcss/vite"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import viteReact from "@vitejs/plugin-react"
import { nitro } from "nitro/vite"
import Icons from 'unplugin-icons/vite'
import { defineConfig } from "vite"
import viteTsConfigPaths from "vite-tsconfig-paths"

const config = defineConfig({
  plugins: [
    nitro({
      compatibilityDate: "2026-01-28",
      preset: 'cloudflare_module',
      cloudflare: {
        deployConfig: true,
        nodeCompat: true
      },
      minify: true,
      rollupConfig: { external: [/^@sentry\//] },
    }),
    viteTsConfigPaths({
      projects: ["./tsconfig.json"],
    }),
    tailwindcss(),
    tanstackStart(),
    viteReact({
      babel: {
        plugins: ['babel-plugin-react-compiler'],
      },
    }),
    Icons({
      compiler: 'jsx',
      autoInstall: true,
    }),
    paraglideVitePlugin({
      project: './project.inlang',
      outdir: './src/paraglide',
      strategy: [
        'custom-queryParam',
        'cookie',
        'preferredLanguage',
        'baseLocale',
      ],
    }),
  ],
  server: {
    host: "0.0.0.0",
    port: 3000,
    allowedHosts: ["holon.dev"],
    hmr: {
      clientPort: 443,
      host: "holon.dev",
    },
  },
})

export default config
