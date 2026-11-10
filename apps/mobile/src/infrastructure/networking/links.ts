const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
/** Only explicit resource routes are accepted; arbitrary notification URLs never reach Linking. */
export function mobileDestination(deepLink: string | null): string | null {
  if (
    !deepLink?.startsWith("/app/") ||
    deepLink.includes("\\") ||
    deepLink.includes("#")
  )
    return null;
  const url = new URL(deepLink, "https://trainflow.invalid");
  if (url.origin !== "https://trainflow.invalid") return null;
  const conversation = url.searchParams.get("conversation");
  if (
    url.pathname === "/app/messages" &&
    conversation &&
    uuid.test(conversation)
  )
    return `/conversation/${conversation}`;
  if (url.pathname === "/app/messages" && !conversation) return "/messages";
  const staticRoutes: Record<string, string> = {
    "/app/calendar": "/events",
    "/app/team": "/team",
    "/app/my-coaches": "/coaches",
    "/app/training-plans": "/training-plans",
  };
  if (staticRoutes[url.pathname]) return staticRoutes[url.pathname]!;
  const routes: [RegExp, string][] = [
    [/^\/app\/clients\/([^/]+)$/, "client"],
    [/^\/app\/check-ins\/([^/]+)$/, "check-in"],
    [/^\/app\/calendar\/([^/]+)$/, "event"],
    [/^\/app\/invitations\/([^/]+)$/, "invitation"],
    [/^\/app\/applications\/([^/]+)$/, "application"],
  ];
  for (const [pattern, native] of routes) {
    const match = pattern.exec(url.pathname);
    if (match?.[1] && uuid.test(match[1])) return `/${native}/${match[1]}`;
  }
  return null;
}
export function webDestination(pathname: string): string | null {
  const match =
    /^\/(client|check-in|event|invitation|application)\/([a-f0-9-]{36})$/i.exec(
      pathname,
    );
  if (match && uuid.test(match[2]!))
    return match[1] === "event"
      ? "/app/calendar"
      : `/app/${({ client: "clients", "check-in": "check-ins", invitation: "invitations", application: "applications" } as Record<string, string>)[match[1]!]}/${match[2]}`;
  return (
    (
      {
        "/team": "/app/team",
        "/coaches": "/app/my-coaches",
        "/events": "/app/calendar",
      } as Record<string, string>
    )[pathname] ?? null
  );
}
export function validPush(data: Record<string, unknown>) {
  return (
    typeof data.accountId === "string" &&
    uuid.test(data.accountId) &&
    typeof data.notificationId === "string" &&
    uuid.test(data.notificationId)
  );
}

export type PushIdentity = { accountId: string; notificationId: string };
export function parsePendingPush(value: string | null): PushIdentity | null {
  try {
    const data: unknown = JSON.parse(value ?? "null");
    return data &&
      typeof data === "object" &&
      validPush(data as Record<string, unknown>)
      ? (data as PushIdentity)
      : null;
  } catch {
    return null;
  }
}
/** Foreground suppression is scoped to one account and the conversation actually open. */
export function isVisibleConversation(
  data: Record<string, unknown>,
  accountId: string,
  conversationId?: string,
) {
  return (
    validPush(data) &&
    data.accountId === accountId &&
    data.resourceType === "Messaging" &&
    !!conversationId &&
    data.resourceId === conversationId
  );
}
