import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import sourceIdentifierPlugin from 'vite-plugin-source-identifier'

const isProd = process.env.BUILD_MODE === 'prod'

export default defineConfig({
  plugins: [
    react(),
    sourceIdentifierPlugin({
      enabled: !isProd,
      attributePrefix: 'data-matrix',
      includeProps: true,
    })
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  // 👇 Agrega esto
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:61210',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:61210',
        ws: true,               // habilita proxy de WebSocket
        changeOrigin: true,
      },
    },
  },
})