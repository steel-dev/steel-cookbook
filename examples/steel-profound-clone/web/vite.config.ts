import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "node:path";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    proxy: {
      // Proxy API requests to the Fastify server running on port 3000
      "/query": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
      "/results": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
      "/healthz": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 5173,
    strictPort: true,
  },
});
