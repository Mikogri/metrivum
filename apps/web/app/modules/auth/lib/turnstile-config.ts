/** Public configuration only; Supabase owns the private verification key. */
export function turnstileConfig(env = import.meta.env) {
  const siteKey = env.VITE_TURNSTILE_SITE_KEY?.trim() ?? "";
  const required =
    env.VITE_AUTH_CAPTCHA_REQUIRED === "true" ||
    (env.PROD && env.VITE_AUTH_CAPTCHA_REQUIRED !== "false") ||
    Boolean(siteKey);
  const testKey = /^[123]x0{10,}/.test(siteKey);
  return {
    siteKey,
    required,
    valid: Boolean(siteKey) && !(env.PROD && testKey),
  };
}
