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
      '/api': 'http://127.0.0.1:8787',
      '/ws': { target: 'ws://127.0.0.1:8787', ws: true }
    },
    fs: {
      // Allow serving WASM files from node_modules
      allow: ['..']
    }
  },
  optimizeDeps: {
    exclude: ['kaspa-wasm32-sdk'], // Don't pre-bundle WASM modules
  },
  build: {
    target: 'esnext', // Required for top-level await
  },
  assetsInclude: ['**/*.wasm'], // Include WASM files as assets
})
