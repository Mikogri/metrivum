import type { Config } from "@react-router/dev/config";
import { prerenderPaths } from "./app/shared/i18n/public-routes";

export default {
  appDirectory: "app",
  // No runtime server: public pages are pre-rendered at build time, /app and /auth run as a SPA.
  ssr: false,
  // "/" is pre-rendered, so React Router also writes build/client/__spa-fallback.html for SPA routes.
  prerender: prerenderPaths,
} satisfies Config;
