import path from "node:path";
import { reactRouter } from "@react-router/dev/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [reactRouter()],
  resolve: {
    alias: {
      "~": path.resolve(import.meta.dirname, "app"),
    },
  },
  server: {
    // 5173 matches the API's default CORS origin and the documented Supabase redirect URL.
    port: Number(process.env.PORT ?? 5173),
    strictPort: true,
  },
  preview: {
    port: 4173,
  },
  build: {
    // Keep chunk reports honest: the landing must stay free of editor/player code.
    chunkSizeWarningLimit: 400,
  },
});
