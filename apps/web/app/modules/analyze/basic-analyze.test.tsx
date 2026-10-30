import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { BasicAnalyze } from "./basic-analyze";

const mocks = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("~/shared/session/AccountScope", () => ({ useApi: () => mocks.api, useAccountKey: () => "basic-account" }));
vi.mock("~/shared/session/WorkspaceScope", () => ({ useWorkspace: () => ({ mode: "coach" }) }));
let cache: QueryClient;
beforeEach(() => {
  cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  mocks.api.mockReset().mockResolvedValue({ data: { clients: { active: 3, suspended: 1, completed: 4 }, finance: { totals: [], series: [] }, checkIns: { submitted: 2, overdue: 1, pendingReview: 1 } } });
});
afterEach(() => cache.clear());

it("loads only Basic API and offers advanced reports without requesting premium data", async () => {
  render(<QueryClientProvider client={cache}><MemoryRouter><BasicAnalyze /></MemoryRouter></QueryClientProvider>);
  await screen.findByText("Active clients");
  expect(mocks.api.mock.calls.map(([request]) => request.path)).toEqual(["/api/v1/analyze/basic"]);
  expect(screen.getByRole("link", { name: "Upgrade to Pro" })).toHaveAttribute("href", "/app/checkout?plan=Pro");
  expect(screen.getByText("No recorded payments in this period")).toBeInTheDocument();
  expect(screen.queryByText("Retention")).not.toBeInTheDocument();
});
