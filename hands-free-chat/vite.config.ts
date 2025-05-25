import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    watch: {
      usePolling: true,
    },
    proxy: {
      // Proxy API requests to the backend
      '/api': {
        target: 'http://backend-dev:3000',
        changeOrigin: true,
      },
      // Proxy WebSocket connections for Socket.IO
      // The client connects to a namespace (e.g., '/chat').
      // The underlying path used by Socket.IO is /socket.io/
      '/socket.io': { // Match the actual path Socket.IO uses
        target: 'http://backend-dev:3000', // Target the base of the backend Socket.IO server
        ws: true,
        changeOrigin: true, // Recommended for Socket.IO
      },
    },
  },
})
