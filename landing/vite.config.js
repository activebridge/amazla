import { defineConfig } from 'vite'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  root: '.',
  base: '/',
  publicDir: 'public',
  build: {
    rollupOptions: {
      input: {
        index: path.resolve(__dirname, 'index.html'),
        'how-it-works': path.resolve(__dirname, 'how-it-works.html'),
      },
    },
  },
  server: {
    allowedHosts: ['58e9-109-227-90-97.ngrok-free.app'],
  },
})
