/**
 * Accepts only same-origin, in-app paths for post-login navigation. Rejects absolute URLs,
 * protocol-relative URLs, backslash tricks and auth routes (to avoid redirect loops).
 */
export function sanitizeReturnTo(
  value: string | null | undefined,
  fallback = "/app/dashboard",
): string {
  if (!value) return fallback;
  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return fallback;
  }
  if (
    !decoded.startsWith("/") ||
    decoded.startsWith("//") ||
    decoded.startsWith("/\\") ||
    // eslint-disable-next-line no-control-regex -- control characters are exactly what is rejected here
    /[\u0000-\u001f]/.test(decoded)
  )
    return fallback;
  if (decoded.includes("://")) return fallback;
  try {
    const url = new URL(decoded, "https://trainflow.invalid");
    if (url.origin !== "https://trainflow.invalid") return fallback;
    if (!(
      url.pathname === "/app" ||
      url.pathname.startsWith("/app/") ||
      url.pathname === "/onboarding" ||
      url.pathname === "/onboarding/plan"
    ))
      return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}

export function loginPath(returnTo?: string, slot?: number): string {
  const params = new URLSearchParams();
  if (returnTo) params.set("returnTo", returnTo);
  if (slot !== undefined) params.set("slot", String(slot));
  const query = params.toString();
  return `/auth/login${query ? `?${query}` : ""}`;
}
