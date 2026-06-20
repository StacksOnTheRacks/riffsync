import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const repoRoot = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../..')

export default defineConfig({
  define: {
    'import.meta.env.VITE_PUBLIC_SFU_WS_URL': JSON.stringify('ws://127.0.0.1:3000'),
    'import.meta.env.VITE_PUBLIC_API_BASE_URL': JSON.stringify(''),
    'import.meta.env.VITE_PUBLIC_WS_URL': JSON.stringify(''),
  },
  resolve: {
    alias: {
      '@web': path.join(repoRoot, 'apps/web/src'),
    },
  },
  test: {
    environment: 'happy-dom',
    include: ['scenarios/**/*.test.ts'],
    testTimeout: 90_000,
  },
})
