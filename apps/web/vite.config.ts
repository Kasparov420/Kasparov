import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({
      globals: {
        Buffer: true,
        global: true,
        process: true,
      },
      protocolImports: true,
    }),
  ],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
      '/ws': { 
        target: 'ws://localhost:8787', 
        ws: true,
        changeOrigin: true,
      }
    }
  },
  optimizeDeps: {
    exclude: ['kaspa'], // Don't pre-bundle WASM modules
  },
  build: {
    target: 'esnext', // Required for top-level await
  },
})
