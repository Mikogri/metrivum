import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "ui-web",
          root: "packages/ui-web",
          environment: "jsdom",
          include: ["src/**/*.test.{ts,tsx}"],
          setupFiles: [path.resolve(import.meta.dirname, "test/setup.ts")],
          css: { modules: { classNameStrategy: "non-scoped" } },
        },
      },
      {
        resolve: { alias: { "~": path.resolve(import.meta.dirname, "apps/web/app") } },
        test: {
          name: "web",
          root: "apps/web",
          environment: "jsdom",
          include: ["app/**/*.test.{ts,tsx}"],
          setupFiles: [path.resolve(import.meta.dirname, "test/setup.ts")],
          css: { modules: { classNameStrategy: "non-scoped" } },
        },
      },
    ],
  },
});
