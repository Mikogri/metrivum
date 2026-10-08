import { act, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { createContext } from "react";
import { MessagingProvider, useNotifications } from "./provider";

const mocks = vi.hoisted(() => ({ play: vi.fn(), paths: [] as string[], incoming: null as null | ((event: { id: string; senderUserId: string; conversationId: string }) => void) }));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({}) }));
vi.mock("react-router", () => ({ useLocation: () => ({ pathname: "/app/messages", search: "?conversation=open" }) }));
vi.mock("~/shared/access", () => ({ useFeatureAccess: () => ({ allowed: true }) }));
vi.mock("~/shared/session", () => ({ useAccountContext: () => ({ account: { userId: "me" }, accountKey: "account" }) }));
vi.mock("~/modules/accounts", () => ({ useProfile: () => ({ roles: ["Client"] }) }));
vi.mock("./notification-sound", () => ({ useNotificationSound: () => ({ play: mocks.play, muted: false, toggle: vi.fn() }) }));
vi.mock("./api", () => ({
  root: "/api/v1/messaging", syncMessage: vi.fn(),
  MessagingPollingContext: createContext(15000),
  useRealtime: (_enabled: boolean, incoming: typeof mocks.incoming) => { mocks.incoming = incoming; return {}; },
  useChatQuery: (path: string) => { mocks.paths.push(path); return { data: path.endsWith("/conversations") ? [{ id: "open", title: "Open chat", unreadCount: 1 }] : [], isPending: false, isError: false }; },
}));
function Probe() { return <div>{useNotifications().items.map(item => item.title).join(",") || "No notifications"}</div>; }
it("plays sound for the open chat, hides its notification and ignores self/duplicate events", () => {
  render(<MessagingProvider><Probe /></MessagingProvider>);
  expect(screen.getByText("No notifications")).toBeTruthy();
  act(() => mocks.incoming?.({ id: "new", senderUserId: "peer", conversationId: "open" }));
  expect(mocks.play).toHaveBeenCalledOnce();
  act(() => mocks.incoming?.({ id: "new", senderUserId: "peer", conversationId: "open" }));
  act(() => mocks.incoming?.({ id: "own", senderUserId: "me", conversationId: "open" }));
  expect(mocks.play).toHaveBeenCalledOnce();
});
it("does not fetch invitations for the messaging badge or sound controls", () => {
  mocks.paths = [];
  render(<MessagingProvider><Probe /></MessagingProvider>);
  expect(mocks.paths).toContain("/api/v1/messaging/conversations");
  expect(mocks.paths).not.toContain("/api/v1/coaching/my-invitations");
});
