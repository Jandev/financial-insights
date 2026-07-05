import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    fs: {
      // Allow serving files from the project root, including data/
      allow: ['.'],
    },
    proxy: {
      // In dev:full mode (Vite + Express running together), proxy API calls
      // to the Express server so state persistence works locally.
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'node',
    alias: {
      '@/': new URL('./src/', import.meta.url).pathname,
    },
  },
})
