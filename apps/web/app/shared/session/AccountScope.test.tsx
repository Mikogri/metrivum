import { StrictMode } from "react";
import { act, render, screen } from "@testing-library/react";
import { Toaster, toast } from "@metrivum/ui-web";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { afterEach, expect, it, vi } from "vitest";
import { AccountScope, useApi } from "./AccountScope";
import { SessionProvider } from "./SessionProvider";
import { SessionManager } from "./manager";
import { slotStorageKey } from "./storage-keys";

vi.mock("~/shared/dev/mockMode", () => ({ MOCK_MODE: false }));
vi.mock("~/shared/http/config", () => ({
  apiBaseUrl: () => "https://api.example.test",
}));

function Profile() {
  const api = useApi();
  const query = useQuery({
    queryKey: ["0:coach", "me"],
    queryFn: async ({ signal }) =>
      (await api<{ displayName: string }>({ path: "/api/v1/me", signal })).data,
  });
  return (
    <p>
      {query.isError
        ? query.error.message
        : (query.data?.displayName ?? "Loading profile")}
    </p>
  );
}

afterEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.unstubAllGlobals();
});

it("loads account queries through StrictMode effect cleanup and replay", async () => {
  const session = {
    access_token: "token",
    user: {
      id: "coach",
      email: "coach@example.test",
      email_confirmed_at: "2026-01-01T00:00:00Z",
    },
  } as Session;
  const client = {
    auth: {
      getSession: async () => ({ data: { session }, error: null }),
      getUser: async () => ({ data: { user: session.user }, error: null }),
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe() {} } },
      }),
    },
  } as unknown as SupabaseClient;
  localStorage.setItem(slotStorageKey(0), JSON.stringify(session));
  const manager = new SessionManager(() => client);
  await manager.start();
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const fetchImpl = vi.fn(
    async () =>
      new Response(JSON.stringify({ displayName: "Coach profile loaded" }), {
        status: 200,
      }),
  );
  vi.stubGlobal("fetch", fetchImpl);
  const { unmount } = render(
    <StrictMode>
      <QueryClientProvider client={cache}>
        <SessionProvider manager={manager}>
          <AccountScope
            account={manager.getState().accounts[0]!}
            generation={manager.getState().generation}
          >
            <Profile />
          </AccountScope>
        </SessionProvider>
      </QueryClientProvider>
    </StrictMode>,
  );
  await screen.findByText("Coach profile loaded");
  expect(fetchImpl).toHaveBeenCalledTimes(1);
  const notifications = render(
    <Toaster label="Notifications" dismissLabel="Dismiss" />,
  );
  act(() => {
    toast({ tone: "danger", title: "Private account error" });
  });
  expect(screen.getByRole("alert")).toHaveTextContent("Private account error");
  unmount();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  notifications.unmount();
  cache.clear();
});
