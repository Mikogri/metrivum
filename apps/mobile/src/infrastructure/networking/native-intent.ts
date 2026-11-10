import { parseAuthCallback } from "../session/auth-callback";

/** System links select a safe screen; Auth alone consumes the original PKCE URL. */
export function nativeIntentPath(path: string): "/auth/callback" | "/" {
  if (path.length > 4096) return "/";
  try {
    return parseAuthCallback(path) ? "/auth/callback" : "/";
  } catch {
    return "/";
  }
}
