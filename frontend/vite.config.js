import { defineConfig, loadEnv } from 'vite'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => {
  const envDir = fileURLToPath(new URL('.', import.meta.url))
  const apiTarget = loadEnv(mode, envDir, 'VITE_API_URL').VITE_API_URL || 'http://localhost:5000'
  return {
    plugins: [
      react(),
      tailwindcss(),
    ],
    // Include dependencies used by lazy routes in the initial prebundle.
    optimizeDeps: {
      include: ['react', 'react-dom/client', 'react-router-dom', 'lucide-react', 'recharts', 'socket.io-client'],
    },
    server: {
      port: 3000,
      fs: {
        allow: ['..'],
      },
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
        },
        '/socket.io': {
          target: apiTarget,
          ws: true,
        }
      }
    }
  }
})
