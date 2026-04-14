import { cloudflare } from '@cloudflare/vite-plugin'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import Icons from 'unplugin-icons/vite'
import { defineConfig } from 'vite'
import ssrPlugin from 'vite-ssr-components/plugin'

export default defineConfig({
  ssr: {
    external: ['react', 'react-dom'],
  },
  plugins: [
    tailwindcss(),
    cloudflare(),
    ssrPlugin({
      hotReload: {
        ignore: ['./src/client.tsx'],
      },
    }),
    react(),
    Icons({ compiler: 'jsx', jsx: 'react' }),
  ],
  server: {
    host: "0.0.0.0",
    port: 5173,
    allowedHosts: ["auth.holon.dev"],
    hmr: {
      clientPort: 443,
      host: "auth.holon.dev",
    },
  },
  resolve: {
    alias: {
      '@': '/src',
    },
  },
})
