import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import TeamRoute, { type Member, type Team } from "./team";
import { createTransport, type Transport } from "~/shared/http/transport";

const context = vi.hoisted(() => ({ api: null as Transport | null }));
vi.mock("~/shared/session/AccountScope", () => ({
  useApi: () => context.api, useAccountKey: () => "0:coach",
  useAccountContext: () => ({ account: { userId: "coach", slot: 0 } }),
}));
vi.mock("~/shared/session/WorkspaceScope", () => ({ useWorkspace: () => ({ mode: "coach" }) }));
vi.mock("~/modules/accounts", () => ({ useProfile: () => ({ roles: ["Coach"] }) }));

const team: Team = { id: "team-1", name: "Test Team", isOwner: false, isMember: true, members: 1,
  role: "Member", status: "Active", description: "", version: 1, purchasedSeats: 2, occupiedSeats: 1,
  periodEnd: null, dissolutionAt: null, allowedActions: [], pendingOwnerId: null };
const member: Member = { userId: "coach", displayName: "Coach One", username: "coach",
  role: "Member", joinedAt: "2026-10-01T00:00:00Z" };
let cache: QueryClient;
let paths: string[];

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  paths = [];
  cache = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000 } } });
  context.api = createTransport({ baseUrl: "https://api.example.test", getAccessToken: async () => "token",
    accountSignal: () => new AbortController().signal, isCurrent: () => true,
    fetchImpl: async input => {
      const path = new URL(String(input)).pathname;
      paths.push(path);
      const data = path.endsWith("/mine") ? { teams: [team], requests: [] }
        : path.endsWith("/members") ? [member] : [];
      return new Response(JSON.stringify(data), { status: 200, headers: { "Content-Type": "application/json" } });
    },
  });
});
afterEach(() => { cache.clear(); vi.unstubAllGlobals(); });

it.each(["Members", "Assigned clients"])("loads the roster only when opening %s and reuses it across tabs", async tab => {
  render(<QueryClientProvider client={cache}><MemoryRouter><TeamRoute /></MemoryRouter></QueryClientProvider>);
  await screen.findByRole("heading", { name: "Test Team" });
  expect(paths).toEqual(["/api/v1/teams/mine"]);
  await userEvent.click(screen.getByRole("tab", { name: tab }));
  await waitFor(() => expect(paths.filter(path => path.endsWith("/members"))).toHaveLength(1));
  await userEvent.click(screen.getByRole("tab", { name: "Overview" }));
  await userEvent.click(screen.getByRole("tab", { name: "Members" }));
  await screen.findByText("Coach One");
  expect(paths.filter(path => path.endsWith("/members"))).toHaveLength(1);
});
