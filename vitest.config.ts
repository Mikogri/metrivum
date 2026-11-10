import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Bound JSDOM process pressure on developer machines and CI; assertions keep their normal deadlines.
    maxWorkers: 4,
    projects: [
      {
        test: {
          name: "mobile-core",
          root: "apps/mobile",
          environment: "node",
          include: ["src/**/*.test.ts"],
        },
      },
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
        resolve: {
          alias: { "~": path.resolve(import.meta.dirname, "apps/web/app") },
        },
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
