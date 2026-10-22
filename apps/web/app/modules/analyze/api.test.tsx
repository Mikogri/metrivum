import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { useAnalysis, type AnalysisTab } from "./api";

const state = vi.hoisted(() => ({ account: "account-a", api: vi.fn() }));
vi.mock("~/shared/session/AccountScope", () => ({ useAccountKey: () => state.account, useApi: () => state.api }));
const params = { from: "2026-10-01", to: "2026-10-07", scope: "Personal" };
const context = { period: params, comparisonPeriod: { from: "2026-09-24", to: "2026-09-30" }, filters: { groups: [], offers: [] } };

function setup(tab: AnalysisTab) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return renderHook(({ tab, scope, teamId }) => useAnalysis(tab, { ...params, scope }, true, teamId), {
    wrapper, initialProps: { tab, scope: "Personal", teamId: undefined as string | undefined },
  });
}

beforeEach(() => {
  state.account = "account-a";
  state.api.mockReset().mockImplementation(async ({ path }) => ({ data: path.endsWith("/context") ? context : { path } }));
});

it.each([
  ["finance", ["context", "financial", "financial"]],
  ["clients", ["context", "clients", "clients", "acquisition"]],
  ["checkins", ["context", "check-ins", "check-ins", "messaging"]],
  ["training", ["context", "training"]],
] as const)("fetches only the active %s tab and its comparison", async (tab, paths) => {
  const { result } = setup(tab);
  await waitFor(() => expect(result.current.query.isSuccess).toBe(true));
  expect(state.api.mock.calls.map(([request]) => request.path.split("/").at(-1)).sort()).toEqual([...paths].sort());
  expect(state.api.mock.calls.every(([request]) => request.signal instanceof AbortSignal)).toBe(true);
  if (tab !== "training") expect(state.api.mock.calls.some(([request]) => request.query.from === "2026-09-24" && request.query.to === "2026-09-30")).toBe(true);
});

it("reuses a fresh tab on return but separates scope, team and account caches", async () => {
  const { result, rerender } = setup("finance");
  await waitFor(() => expect(result.current.query.isSuccess).toBe(true));
  rerender({ tab: "training", scope: "Personal", teamId: undefined });
  await waitFor(() => expect(result.current.query.data?.section).toBe("training"));
  const count = state.api.mock.calls.length;
  rerender({ tab: "finance", scope: "Personal", teamId: undefined });
  await waitFor(() => expect(result.current.query.data?.section).toBe("finance"));
  expect(state.api).toHaveBeenCalledTimes(count);
  for (const [account, scope, teamId] of [["account-a", "Team", "team-a"], ["account-a", "Team", "team-b"], ["account-b", "Team", "team-b"]]) {
    state.account = account!;
    const before = state.api.mock.calls.length;
    rerender({ tab: "finance", scope: scope!, teamId });
    expect(result.current.query.data).toBeUndefined();
    await waitFor(() => expect(result.current.query.isSuccess).toBe(true));
    expect(state.api.mock.calls.length).toBe(before + 3);
  }
});

it("aborts obsolete section requests when another tab becomes active", async () => {
  const signals: AbortSignal[] = [];
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  state.api.mockImplementation(async ({ path, signal }) => {
    if (path.endsWith("/context")) return { data: context };
    if (path.endsWith("/financial")) { signals.push(signal); await pending; }
    return { data: { path } };
  });
  const { result, rerender } = setup("finance");
  await waitFor(() => expect(signals).toHaveLength(2));
  rerender({ tab: "training", scope: "Personal", teamId: undefined });
  expect(signals.every(signal => signal.aborted)).toBe(true);
  release();
  await waitFor(() => expect(result.current.query.data?.section).toBe("training"));
});

it("does not retain another member's charts while the new member loads", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const { result, rerender } = renderHook(({ memberId }) => useAnalysis("finance", { ...params, scope: "TeamMember", memberId }, true, "team-a"), {
    wrapper, initialProps: { memberId: "member-a" },
  });
  await waitFor(() => expect(result.current.query.isSuccess).toBe(true));
  const before = state.api.mock.calls.length;
  rerender({ memberId: "member-b" });
  expect(result.current.query.data).toBeUndefined();
  expect(result.current.metadata).toBeUndefined();
  await waitFor(() => expect(result.current.query.isSuccess).toBe(true));
  expect(state.api.mock.calls.slice(before).map(([request]) => request.query.memberId)).toEqual(["member-b", "member-b", "member-b"]);
});

it("uses real overview metadata when opening a detail tab", async () => {
  state.api.mockImplementation(async ({ path }) => ({ data: path.endsWith("/overview") ? context : { path } }));
  const { result, rerender } = setup("overview");
  await waitFor(() => expect(result.current.query.isSuccess).toBe(true));
  rerender({ tab: "finance", scope: "Personal", teamId: undefined });
  await waitFor(() => expect(result.current.query.isSuccess).toBe(true));
  expect(state.api.mock.calls.map(([request]) => request.path.split("/").at(-1)).sort()).toEqual(["financial", "financial", "overview"]);
});

it("does not repopulate an account cache from a cancelled overview", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let release!: () => void;
  let requestSignal: AbortSignal | undefined;
  const pending = new Promise<void>(resolve => { release = resolve; });
  state.api.mockImplementation(async ({ signal }) => { requestSignal = signal; await pending; return { data: context }; });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const { unmount } = renderHook(() => useAnalysis("overview", params, true), { wrapper });
  await waitFor(() => expect(requestSignal).toBeDefined());
  unmount();
  client.removeQueries({ queryKey: [state.account] });
  await act(async () => { release(); await pending; });
  expect(requestSignal!.aborted).toBe(true);
  expect(client.getQueriesData({ queryKey: [state.account] })).toEqual([]);
});
