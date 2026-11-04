import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api/transcription': {
        target: 'http://127.0.0.1:8787',
        ws: true,
      },
      '/api/catch-up': {
        target: 'http://127.0.0.1:8787',
      },
      '/api/study-notes': {
        target: 'http://127.0.0.1:8787',
      },
    },
  },
})
