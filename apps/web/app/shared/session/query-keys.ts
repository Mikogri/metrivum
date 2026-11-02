import type { QueryValue } from "~/shared/http";

// These responses describe the account, not the selected Coach/Client presentation.
const accountWide = new Set(["/api/v1/me/team-context", "/api/v1/me/platform-subscription", "/api/v1/subscriptions/plans"]);
export function accountResourceKey(account: string, mode: string, path: string, query?: Record<string, QueryValue>) {
  return [account, "coaching", accountWide.has(path) ? "shared" : mode, path, query] as const;
}
