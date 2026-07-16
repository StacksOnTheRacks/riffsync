import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

const repoRoot = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../..')

function googleAnalyticsIndexHtmlPlugin(): Plugin {
  return {
    name: 'riffsync-google-analytics-index-html',
    transformIndexHtml(html) {
      const measurementId = process.env.VITE_GA_MEASUREMENT_ID?.trim()
      if (!measurementId) {
        return html
      }

      const snippet = [
        `<!-- Google tag (gtag.js) -->`,
        `<script async src="https://www.googletagmanager.com/gtag/js?id=${measurementId}"></script>`,
        `<script>`,
        `  window.dataLayer = window.dataLayer || [];`,
        `  function gtag(){dataLayer.push(arguments);}`,
        `  gtag('js', new Date());`,
        ``,
        `  gtag('config', '${measurementId}');`,
        `</script>`,
      ].join('\n    ')

      return html.replace('</head>', `    ${snippet}\n  </head>`)
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), googleAnalyticsIndexHtmlPlugin()],
  server: {
    fs: { allow: [repoRoot] },
  },
})
