import { defineConfig } from "vite";
import { readFileSync } from "node:fs";
const pkg = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8"),
);
const dependencies = Object.keys({
  ...pkg.dependencies,
  ...pkg.peerDependencies,
});
export default defineConfig({
  build: {
    lib: {
      entry: "src/index.ts",
      formats: ["es"],
      fileName: "index",
      cssFileName: "components",
    },
    rolldownOptions: {
      external: (id) =>
        dependencies.some((name) => id === name || id.startsWith(name + "/")),
    },
  },
});
