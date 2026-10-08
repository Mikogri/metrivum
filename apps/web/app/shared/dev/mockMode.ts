/**
 * Explicit developer mock mode: `VITE_DEV_MOCKS=1 npm run dev`. Never active in production
 * builds (import.meta.env.DEV is false there, so the mock modules are tree-shaken away) and
 * never used as a fallback when the real API fails.
 */
export const MOCK_MODE = import.meta.env.DEV && import.meta.env.VITE_DEV_MOCKS === "1";
