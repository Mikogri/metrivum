import type { DurableNotification } from "./durable-notifications";

export function notificationTargetsView(notification: DurableNotification, target: string) {
  if (notification.type === "MessageCreated" || !notification.deepLink?.startsWith("/app/")) return false;
  const link = new URL(notification.deepLink, "https://local");
  const view = new URL(target, "https://local");
  return link.pathname.replace(/\/$/, "") === view.pathname.replace(/\/$/, "") &&
    [...new Set(link.searchParams.keys())].every(key =>
      JSON.stringify(link.searchParams.getAll(key)) === JSON.stringify(view.searchParams.getAll(key)));
}
