import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  define: {
    'import.meta.env.VITE_MAX_UPLOAD_BYTES': JSON.stringify(process.env.VERCEL ? 4 * 1024 * 1024 : 25 * 1024 * 1024),
  },
  server: {
    port: 5173,
    open: true,
    proxy: {
      '/api': { target: 'http://localhost:4000', changeOrigin: true },
    },
  },
})
