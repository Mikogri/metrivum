export type WorkspaceMode = "coach" | "client";

export function initialWorkspace(
  roles: readonly string[],
  saved: string | null,
): WorkspaceMode {
  return roles.includes("Coach") && saved !== "client" ? "coach" : "client";
}

export function routeWorkspace(path: string): WorkspaceMode | null {
  if (
    /^\/app\/(my-coaches|my-applications|my-invitations|my-check-ins|my-training|my-analyses|training-plans|my-documents|payments|coaches)(\/|$)/.test(
      path,
    )
  )
    return "client";
  if (
    /^\/app\/(dashboard|clients|groups|leads|forms|offers|earnings|analyze|coaching-preferences|check-in-schedules|training|programs|templates|formulas|exercises|video-analyses)(\/|$)/.test(
      path,
    )
  )
    return "coach";
  if (path === "/app/check-ins" || path === "/app/invitations") return "coach";
  return null;
}

/**
 * The same page in the other workspace, for pages both sides can open (a workout is the client's and their coach's).
 * A link opened in the "wrong" workspace then lands on that page instead of asking to switch; the API decides access.
 */
export function twinRoute(path: string, mode: WorkspaceMode): string | null {
  const workout = /^\/app\/(?:my-training|training)\/workouts\/([^/]+)$/.exec(
    path,
  );
  if (workout)
    return mode === "coach"
      ? `/app/training/workouts/${workout[1]}`
      : `/app/my-training/workouts/${workout[1]}`;
  // The dashboard is the coach's home; a client lands on their training instead (e.g. right after signing up).
  if (path === "/app/dashboard" && mode === "client") return "/app/my-training";
  return null;
}

export const clientSections = [
  ["Clients", "/app/clients"],
  ["Leads", "/app/leads"],
  ["Invitations", "/app/invitations"],
  ["Groups", "/app/groups"],
  ["Check-ins", "/app/check-ins"],
] as const;

export function clientSection(path: string) {
  if (path.startsWith("/app/applications/")) return "/app/leads";
  if (path.startsWith("/app/services/")) return "/app/clients";
  return clientSections.find(
    ([, url]) => path === url || path.startsWith(`${url}/`),
  )?.[1];
}
