import type { WorkspaceMode } from "~/shared/session/workspace-model";

export type MobileDestination = { id: string; label: string; to: string };
export function mobileDestinations(mode: WorkspaceMode): MobileDestination[] {
  // Both views always show five destinations.
  if (mode === "client")
    return [
      { id: "today", label: "Today", to: "/app/today" },
      { id: "training", label: "Training", to: "/app/my-training" },
      { id: "calendar", label: "Calendar", to: "/app/calendar" },
      { id: "messages", label: "Messages", to: "/app/messages" },
      { id: "more", label: "More", to: "/app/more" },
    ];
  return [
    { id: "today", label: "Today", to: "/app/today" },
    { id: "clients", label: "Clients", to: "/app/clients" },
    { id: "messages", label: "Messages", to: "/app/messages" },
    { id: "calendar", label: "Calendar", to: "/app/calendar" },
    { id: "more", label: "More", to: "/app/more" },
  ];
}

const within = (path: string, parent: string) =>
  path === parent || path.startsWith(`${parent}/`);
export function mobileSelection(
  mode: WorkspaceMode,
  path: string,
  search: string,
) {
  if (within(path, "/app/messages")) return "messages";
  if (within(path, "/app/calendar")) return "calendar";
  if (mode === "client") {
    if (path === "/app/today") return "today";
    if (
      ["/app/dashboard", "/app"].includes(path) ||
      within(path, "/app/my-training") ||
      within(path, "/app/training-plans")
    )
      return "training";
    return "more";
  }
  if (path === "/app/today" || path === "/app/dashboard" || path === "/app")
    return "today";
  if (
    [
      "clients",
      "groups",
      "leads",
      "invitations",
      "applications",
      "services",
    ].some((x) => within(path, `/app/${x}`))
  )
    return "clients";
  void search;
  return "more";
}

export function immersiveMobileRoute(path: string, search: string) {
  const params = new URLSearchParams(search);
  return (
    (path === "/app/messages" &&
      !!(params.get("conversation") || params.get("person"))) ||
    /^\/app\/(my-training|training)\/workouts\//.test(path) ||
    /\/edit$/.test(path)
  );
}

export function mobileViewport(
  height: number,
  viewport: { height: number; offsetTop: number; scale: number } | undefined,
  editing: boolean,
) {
  if (!viewport || Math.abs(viewport.scale - 1) > 0.05)
    return { height, top: 0, keyboard: false };
  return {
    height: viewport.height,
    top: viewport.offsetTop,
    keyboard: editing && height - viewport.height > 120,
  };
}
