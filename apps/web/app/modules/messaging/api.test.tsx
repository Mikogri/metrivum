import { renderHook, act, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({
  generation: 1,
  invalidate: vi.fn(),
  stop: vi.fn(async () => {}),
  handlers: {} as Record<string, (...args: unknown[]) => void>,
  factory: null as null | (() => Promise<string>),
  token: vi.fn(async () => "token-one"),
}));
vi.mock("~/shared/session", () => ({
  useAccountContext: () => ({
    account: { slot: "0", userId: "one" },
    accountKey: "0:one",
    lifecycle,
  }),
  useSessionManager: () => manager,
}));
const manager = {
  getState: () => ({ activeSlot: "0", generation: mock.generation }),
  accessToken: mock.token,
};
const lifecycle = {
  isCurrent: () => mock.generation === 1,
  signal: () => new AbortController().signal,
  accessToken: async () => {
    if (mock.generation !== 1) throw new StaleAccountError();
    return mock.token();
  },
};
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => cache,
  useQuery: vi.fn(),
}));
const cache = { invalidateQueries: mock.invalidate };
vi.mock("~/shared/dev/mockMode", () => ({ MOCK_MODE: false }));
vi.mock("~/shared/http", () => ({ apiBaseUrl: () => "https://api.test" }));
vi.mock("@microsoft/signalr", () => ({
  LogLevel: { None: 6 },
  HubConnectionBuilder: class {
    withUrl(
      _url: string,
      options: { accessTokenFactory: () => Promise<string> },
    ) {
      mock.factory = options.accessTokenFactory;
      return this;
    }
    configureLogging() {
      return this;
    }
    withAutomaticReconnect() {
      return this;
    }
    build() {
      return {
        on: (event: string, handler: (...args: unknown[]) => void) => {
          mock.handlers[event] = handler;
        },
        onreconnecting: vi.fn(),
        onreconnected: vi.fn(),
        onclose: vi.fn(),
        start: async () => {},
        stop: mock.stop,
      };
    }
  },
}));
import { useRealtime } from "./api";
import { StaleAccountError } from "~/shared/http/errors";
it("closes the account connection and rejects old-account callbacks and token requests", async () => {
  const { result, unmount } = renderHook(() => useRealtime(true));
  await waitFor(() => expect(result.current.status).toBe("Live"));
  expect(await mock.factory!()).toBe("token-one");
  mock.invalidate.mockClear();
  mock.generation = 2;
  act(() => mock.handlers.MessageCreated!());
  expect(mock.invalidate).not.toHaveBeenCalled();
  await expect(mock.factory!()).rejects.toBeInstanceOf(StaleAccountError);
  unmount();
  expect(mock.stop).toHaveBeenCalled();
});
