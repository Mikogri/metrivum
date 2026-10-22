import path from "node:path";
import { readFile } from "node:fs/promises";
import { reactRouter } from "@react-router/dev/vite";
import { defineConfig } from "vite";

export default defineConfig({
  // Keep test and interactive dev servers from invalidating each other's optimized dependencies.
  cacheDir: path.resolve(import.meta.dirname, '../../node_modules/.vite/trainflow-web', process.env.PORT ?? '5173'),
  plugins: [{
    name: 'analyzer-update-metadata',
    configureServer(server) {
      // Large downloads are unwatched; newly generated metadata must still be discoverable without a restart.
      server.middlewares.use('/downloads/analyzer/update.json', async (request, response) => {
        if (request.method !== 'GET' && request.method !== 'HEAD') { response.statusCode = 405; response.end(); return; }
        response.setHeader('Cache-Control', 'no-store');
        try {
          const body = await readFile(path.resolve(import.meta.dirname, 'public/downloads/analyzer/update.json'));
          response.setHeader('Content-Type', 'application/json');
          response.end(request.method === 'HEAD' ? undefined : body);
        } catch { response.statusCode = 404; response.end(); }
      });
    },
  }, reactRouter()],
  resolve: {
    alias: {
      "~": path.resolve(import.meta.dirname, "app"),
    },
  },
  server: {
    // 5173 matches the API's default CORS origin and the documented Supabase redirect URL.
    port: Number(process.env.PORT ?? 5173),
    strictPort: true,
    // Generated multi-GB installer assets must not reload a user's active analysis/draft.
    watch: { ignored: ['**/public/downloads/analyzer/**'] },
  },
  preview: {
    port: 4173,
  },
  build: {
    // Keep chunk reports honest: the landing must stay free of editor/player code.
    chunkSizeWarningLimit: 400,
  },
});
