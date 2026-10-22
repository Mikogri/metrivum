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
let urls: URL[];
let clientCount = 0;
let memberCount = 1;

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  paths = [];
  urls = []; clientCount = 0; memberCount = 1;
  cache = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000 } } });
  context.api = createTransport({ baseUrl: "https://api.example.test", getAccessToken: async () => "token",
    accountSignal: () => new AbortController().signal, isCurrent: () => true,
    fetchImpl: async input => {
      const url = new URL(String(input));
      urls.push(url);
      const path = url.pathname;
      paths.push(path);
      const data = path.endsWith("/mine") ? { teams: [team], requests: [] }
        : path.endsWith("/members") ? Array.from({ length: memberCount }, (_, index) => ({ ...member, userId: `coach-${index}`, displayName: index === 0 ? "Coach One" : `Coach ${index + 1}` })).slice((Number(url.searchParams.get("page") ?? 1) - 1) * Number(url.searchParams.get("pageSize") ?? 1000), Number(url.searchParams.get("page") ?? 1) * Number(url.searchParams.get("pageSize") ?? 1000))
        : path === "/api/v1/teams/team-1/clients" ? Array.from({ length: clientCount }, (_, index) => ({
          id: `case-${index}`, teamId: "team-1", clientName: `Client ${index + 1}`, status: "Active", assignedCoachIds: [], allowedActions: [],
        })).slice((Number(url.searchParams.get("page") ?? 1) - 1) * Number(url.searchParams.get("pageSize") ?? 1000), Number(url.searchParams.get("page") ?? 1) * Number(url.searchParams.get("pageSize") ?? 1000)) : [];
      return new Response(JSON.stringify(data), { status: 200, headers: { "Content-Type": "application/json" } });
    },
  });
});

it("paginates Team clients on the server, reuses cached pages and does not fetch inactive panels", async () => {
  clientCount = 26;
  render(<QueryClientProvider client={cache}><MemoryRouter><TeamRoute /></MemoryRouter></QueryClientProvider>);
  await screen.findByRole("heading", { name: "Test Team" });
  expect(urls.map(url => url.pathname)).toEqual(["/api/v1/teams/mine"]);
  await userEvent.click(screen.getByRole("tab", { name: "Assigned clients" }));
  await screen.findByText("Client 1");
  expect(screen.queryByText("Client 26")).not.toBeInTheDocument();
  const requests = () => urls.filter(url => url.pathname === "/api/v1/teams/team-1/clients");
  expect(requests()[0]!.searchParams.get("pageSize")).toBe("25");
  await userEvent.click(screen.getByRole("button", { name: "Next Team clients" }));
  await screen.findByText("Client 26");
  expect(requests()[1]!.searchParams.get("page")).toBe("2");
  expect(screen.getByRole("button", { name: "Next Team clients" })).toBeDisabled();
  await userEvent.click(screen.getByRole("button", { name: "Previous Team clients" }));
  await screen.findByText("Client 1");
  expect(requests()).toHaveLength(2);
  expect(paths.some(path => path.includes("billing"))).toBe(false);
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
  expect(paths.filter(path => path.endsWith("/members"))).toHaveLength(tab === "Members" ? 1 : 2);
});

it("paginates member rows without downloading the entire roster", async () => {
  memberCount = 26;
  render(<QueryClientProvider client={cache}><MemoryRouter><TeamRoute /></MemoryRouter></QueryClientProvider>);
  await screen.findByRole("heading", { name: "Test Team" });
  await userEvent.click(screen.getByRole("tab", { name: "Members" }));
  await screen.findByText("Coach One");
  expect(screen.queryByText("Coach 26")).not.toBeInTheDocument();
  expect(urls.find(url => url.pathname.endsWith("/members"))?.searchParams.get("pageSize")).toBe("25");
  await userEvent.click(screen.getByRole("button", { name: "Next Team members" }));
  await screen.findByText("Coach 26");
  expect(screen.getByRole("button", { name: "Next Team members" })).toBeDisabled();
});
