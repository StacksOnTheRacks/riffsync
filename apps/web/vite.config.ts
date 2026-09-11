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

function isCastReceiverHtml(filename?: string, htmlPath?: string): boolean {
  const target = filename ?? htmlPath ?? ''
  return target.includes('cast/receiver')
}

function stripReceiverModules(html: string): string {
  return html
    .replace(/<script type="module"[^>]*><\/script>\s*/g, '')
    .replace(/<link rel="modulepreload"[^>]*>\s*/g, '')
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
    {
      name: 'riffsync-cast-receiver-classic-html',
      transformIndexHtml: {
        order: 'post',
        handler(html, ctx) {
          if (!isCastReceiverHtml(ctx.filename, ctx.path)) return html
          if (ctx.server) {
            return html.replace(
              /<script src="\/cast-receiver-app\.js"[^>]*><\/script>/,
              '<script type="module" src="/src/pages/cast/castReceiverMain.ts"></script>',
            )
          }
          return stripReceiverModules(html)
        },
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
