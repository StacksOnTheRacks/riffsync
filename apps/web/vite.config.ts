import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const repoRoot = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../..')
const webRoot = fileURLToPath(new URL('.', import.meta.url))

function rewriteCastReceiverCleanUrl(
  req: { url?: string },
  _res: unknown,
  next: () => void,
) {
  const url = req.url ?? ''
  if (url === '/cast/receiver' || url.startsWith('/cast/receiver?')) {
    req.url = url.replace('/cast/receiver', '/cast/receiver/index.html')
  }
  next()
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'riffsync-cast-receiver-clean-url',
      configureServer(server) {
        server.middlewares.use(rewriteCastReceiverCleanUrl)
      },
      configurePreviewServer(server) {
        server.middlewares.use(rewriteCastReceiverCleanUrl)
      },
    },
  ],
  server: {
    port: 5173,
    strictPort: true,
    fs: { allow: [repoRoot] },
  },
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(webRoot, 'index.html'),
        castReceiver: path.resolve(webRoot, 'cast/receiver/index.html'),
      },
    },
  },
})
