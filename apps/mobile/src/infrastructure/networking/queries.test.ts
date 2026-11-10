import { beforeEach, expect, it, vi } from "vitest";
import type { ApiRequest } from "@metrivum/api-client-web/transport";

const mocks = vi.hoisted(() => ({
  controller: new AbortController(),
  invalidate: vi.fn(),
  toast: vi.fn(),
  haptic: vi.fn().mockResolvedValue(undefined),
  callbacks: {} as {
    onSuccess: (data: unknown, request: ApiRequest) => Promise<void>;
    onError: (error: Error) => void;
  },
}));
vi.mock("expo-haptics", () => ({
  notificationAsync: mocks.haptic,
  NotificationFeedbackType: { Success: "success" },
}));
vi.mock("@metrivum/ui-mobile", () => ({ useToast: () => mocks.toast }));
vi.mock("../session/MobileSession", () => ({
  useMobile: () => ({
    api: vi.fn(),
    accountId: "account",
    accountSignal: mocks.controller.signal,
  }),
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: vi.fn(),
  useQueryClient: () => ({ invalidateQueries: mocks.invalidate }),
  useMutation: (callbacks: typeof mocks.callbacks) => {
    mocks.callbacks = callbacks;
    return callbacks;
  },
}));
import { useApiMutation } from "./queries";

beforeEach(() => {
  mocks.controller = new AbortController();
  vi.clearAllMocks();
});

it("does not run success callbacks for an aborted account", async () => {
  const callback = vi.fn();
  useApiMutation(callback);
  mocks.controller.abort();
  await mocks.callbacks.onSuccess(
    {},
    { path: "/api/v1/messaging/conversations", method: "POST" },
  );
  mocks.callbacks.onError(new Error("Late error"));
  expect(callback).not.toHaveBeenCalled();
  expect(mocks.toast).not.toHaveBeenCalled();
  expect(mocks.invalidate).not.toHaveBeenCalled();
});

it("rechecks account after an asynchronous consumer callback", async () => {
  let finish!: () => void;
  useApiMutation(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const completion = mocks.callbacks.onSuccess(
    {},
    { path: "/api/v1/me", method: "PATCH" },
  );
  mocks.controller.abort();
  finish();
  await completion;
  expect(mocks.invalidate).not.toHaveBeenCalled();
  expect(mocks.haptic).not.toHaveBeenCalled();
});

it("chat invalidates conversations and notification counts without unrelated finances", async () => {
  useApiMutation(undefined, { successMessage: false });
  await mocks.callbacks.onSuccess(
    {},
    { path: "/api/v1/messaging/conversations/one/read", method: "POST" },
  );
  const { predicate } = mocks.invalidate.mock.calls[0]![0];
  const matches = (path: string) =>
    predicate({ queryKey: ["account", "coach", path] });
  expect(matches("/api/v1/messaging/conversations")).toBe(true);
  expect(matches("/api/v1/me/notifications/unread-count")).toBe(true);
  expect(matches("/api/v1/analyze/financial")).toBe(false);
  expect(matches("/api/v1/training/progress")).toBe(false);
  expect(predicate({ queryKey: ["account", "mobile-messages", "one"] })).toBe(
    true,
  );
  expect(
    predicate({ queryKey: ["other-account", "mobile-messages", "one"] }),
  ).toBe(false);
  expect(
    predicate({
      queryKey: ["other-account", "coach", "/api/v1/messaging/conversations"],
    }),
  ).toBe(false);
  expect(mocks.toast).not.toHaveBeenCalled();
});

it("supports exact scoped invalidation and keeps the existing fallback for other modules", async () => {
  useApiMutation(undefined, {
    invalidatePaths: ["/api/v1/forms"],
    successMessage: "Published",
  });
  await mocks.callbacks.onSuccess(
    {},
    { path: "/api/v1/forms/one/publish", method: "POST" },
  );
  const { predicate } = mocks.invalidate.mock.calls[0]![0];
  expect(
    predicate({ queryKey: ["account", "coach", "/api/v1/forms-foreign"] }),
  ).toBe(false);
  expect(predicate({ queryKey: ["account", "coach", "/api/v1/forms"] })).toBe(
    true,
  );
  expect(mocks.toast).toHaveBeenCalledWith("Published");
  useApiMutation();
  await mocks.callbacks.onSuccess(
    {},
    { path: "/api/v1/training/programs", method: "POST" },
  );
  const fallback = mocks.invalidate.mock.lastCall![0].predicate;
  expect(
    fallback({ queryKey: ["account", "coach", "/api/v1/training/progress"] }),
  ).toBe(true);
  expect(
    fallback({
      queryKey: ["other-account", "coach", "/api/v1/training/progress"],
    }),
  ).toBe(false);
});
