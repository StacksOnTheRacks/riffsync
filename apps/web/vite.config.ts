import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const repoRoot = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../..')
const webRoot = fileURLToPath(new URL('.', import.meta.url))
const CAST_DIAG_API_PLACEHOLDER = '__RIFFSYNC_PUBLIC_API_BASE_URL__'

function publicApiBaseUrl(): string {
  return (process.env.VITE_PUBLIC_API_BASE_URL ?? '').trim().replace(/\/$/, '')
}

function applyCastDiagApi(source: string): string {
  const apiBase = publicApiBaseUrl()
  let next = source.split(CAST_DIAG_API_PLACEHOLDER).join(apiBase)
  if (!apiBase) {
    next = next.replace(/<img[^>]*data-riffsync-cast-diag-pixel="true"[^>]*>\s*/g, '')
  }
  return next
}

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
          const withApi = applyCastDiagApi(html)
          if (ctx.server) {
            return withApi.replace(
              /<script src="\/cast-receiver-app\.js"[^>]*><\/script>/,
              '<script type="module" src="/src/pages/cast/castReceiverMain.ts"></script>',
            )
          }
          return stripReceiverModules(withApi)
        },
      },
    },
    {
      name: 'riffsync-cast-diag-api',
      configureServer(server) {
        server.middlewares.use((req: IncomingMessage, res: ServerResponse, next: () => void) => {
          const url = req.url ?? ''
          if (!url.startsWith('/cast-receiver-diag.js')) {
            next()
            return
          }
          const file = path.join(webRoot, 'public/cast-receiver-diag.js')
          res.setHeader('content-type', 'text/javascript; charset=utf-8')
          res.end(applyCastDiagApi(readFileSync(file, 'utf8')))
        })
      },
      configurePreviewServer(server) {
        server.middlewares.use((req: IncomingMessage, res: ServerResponse, next: () => void) => {
          const url = req.url ?? ''
          if (!url.startsWith('/cast-receiver-diag.js')) {
            next()
            return
          }
          const file = path.join(webRoot, 'dist/cast-receiver-diag.js')
          if (!existsSync(file)) {
            next()
            return
          }
          res.setHeader('content-type', 'text/javascript; charset=utf-8')
          res.end(readFileSync(file, 'utf8'))
        })
      },
      closeBundle() {
        const dist = path.resolve(webRoot, 'dist')
        for (const relative of ['cast-receiver-diag.js', 'cast/receiver/index.html']) {
          const file = path.join(dist, relative)
          if (!existsSync(file)) continue
          writeFileSync(file, applyCastDiagApi(readFileSync(file, 'utf8')))
        }
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
