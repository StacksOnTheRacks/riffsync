import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const webRoot = fileURLToPath(new URL('.', import.meta.url))

// Classic IIFE for Chromecast firmware that never evaluates type="module".
export default defineConfig({
  plugins: [react()],
  publicDir: false,
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  build: {
    emptyOutDir: false,
    outDir: path.resolve(webRoot, 'dist'),
    cssCodeSplit: false,
    lib: {
      entry: path.resolve(webRoot, 'src/pages/cast/castReceiverApp.tsx'),
      name: 'RiffSyncCastReceiverApp',
      formats: ['iife'],
      fileName: () => 'cast-receiver-app.js',
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
        assetFileNames: (asset) =>
          asset.name?.endsWith('.css') ? 'cast-receiver-app.css' : 'assets/[name][extname]',
      },
    },
  },
})
