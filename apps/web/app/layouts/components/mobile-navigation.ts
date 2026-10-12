import type { WorkspaceMode } from "~/shared/session/workspace-model";

export type MobileDestination = { id: string; label: string; to: string };
export function mobileDestinations(mode: WorkspaceMode): MobileDestination[] {
  return [
    { id: "today", label: "Today", to: "/app/today" },
    ...(mode === "coach" ? [{ id: "clients", label: "Clients", to: "/app/clients" }] : [
      { id: "plans", label: "Plans", to: "/app/my-training?tab=plans" },
      { id: "history", label: "History", to: "/app/my-training?tab=history" },
    ]),
    { id: "messages", label: "Messages", to: "/app/messages" },
    ...(mode === "coach" ? [{ id: "calendar", label: "Calendar", to: "/app/calendar" }] : []),
    { id: "more", label: "More", to: "/app/more" },
  ];
}

const within = (path: string, parent: string) => path === parent || path.startsWith(`${parent}/`);
export function mobileSelection(mode: WorkspaceMode, path: string, search: string) {
  if (path === "/app/today" || path === "/app/dashboard" || path === "/app") return "today";
  if (within(path, "/app/messages")) return "messages";
  if (mode === "coach") {
    if (["clients", "groups", "leads", "invitations", "applications", "services"].some(x => within(path, `/app/${x}`))) return "clients";
    if (within(path, "/app/calendar")) return "calendar";
  } else {
    if (within(path, "/app/training-plans")) return "plans";
    if (within(path, "/app/my-training")) return new URLSearchParams(search).get("tab") === "plans" ? "plans" : "history";
  }
  return "more";
}

export function immersiveMobileRoute(path: string, search: string) {
  const params = new URLSearchParams(search);
  return (path === "/app/messages" && !!(params.get("conversation") || params.get("person"))) ||
    /^\/app\/(my-training|training)\/workouts\//.test(path) || /\/edit$/.test(path);
}

export function mobileViewport(height: number, viewport: { height: number; offsetTop: number; scale: number } | undefined, editing: boolean) {
  if (!viewport || Math.abs(viewport.scale - 1) > 0.05) return { height, top: 0, keyboard: false };
  return { height: viewport.height, top: viewport.offsetTop, keyboard: editing && height - viewport.height > 120 };
}
