import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Load .env so we can read VITE_API_BASE_URL for the dev proxy target
  const env = loadEnv(mode, process.cwd(), '')
  const apiTarget = env.VITE_API_BASE_URL || 'http://localhost:8085'

  return {
    plugins: [react()],
    server: {
      host: true,
      port: 5180,
      allowedHosts: true,
      proxy: {
        // Forward all /api/* requests to the Express server during development
        '/api': {
          target: apiTarget,
          changeOrigin: true,
        }
      }
    }
  }
})

