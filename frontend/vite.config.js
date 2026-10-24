import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
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
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://localhost:5000',
        ws: true,
      }
    }
  }
})
