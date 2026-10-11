export type WorkspaceMode = "coach" | "client";

export function initialWorkspace(roles: readonly string[], saved: string | null): WorkspaceMode {
  return roles.includes("Coach") && saved !== "client" ? "coach" : "client";
}

export function routeWorkspace(path: string): WorkspaceMode | null {
  if (/^\/app\/(my-coaches|my-applications|my-invitations|my-check-ins|my-training|training-plans|my-documents|payments|coaches)(\/|$)/.test(path)) return "client";
  if (/^\/app\/(dashboard|clients|groups|leads|forms|offers|earnings|analyze|coaching-preferences|check-in-schedules|training|programs|templates|formulas|exercises|video-analyses)(\/|$)/.test(path)) return "coach";
  if (path === "/app/check-ins" || path === "/app/invitations") return "coach";
  return null;
}

export const clientSections = [
  ["Clients", "/app/clients"], ["Leads", "/app/leads"],
  ["Invitations", "/app/invitations"], ["Groups", "/app/groups"], ["Check-ins", "/app/check-ins"],
] as const;

export function clientSection(path: string) {
  if (path.startsWith("/app/applications/")) return "/app/leads";
  if (path.startsWith("/app/services/")) return "/app/clients";
  return clientSections.find(([, url]) => path === url || path.startsWith(`${url}/`))?.[1];
}
