import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { beforeEach, expect, it, vi } from "vitest";
import { Offers } from "./SubscriptionPanel";

const fixture = vi.hoisted(() => ({ current: "Free", mutate: vi.fn(), mutateAsync: vi.fn(), active: true }));
vi.mock("~/modules/accounts", () => ({ useProfile: () => ({ roles: ["Coach"] }) }));
vi.mock("~/shared/session/AccountScope", () => ({ useAccountKey: () => "test-account" }));
vi.mock("~/modules/coaching", () => ({
  money: (amount: number, currency: string) => amount + " " + currency,
  Failure: () => <p>Failure</p>, MutationError: () => null,
  useCoachingMutation: () => ({ mutate: fixture.mutate, mutateAsync: fixture.mutateAsync, isPending: false }),
  useCoachingQuery: (path: string) => ({ isPending: false, isError: false, data: path.endsWith("/plans") ? [
    { id: "Free", name: "Free", amount: 0, currency: "EUR", priceConfigured: true, capabilities: [], limits: { "coaching.active_clients": 3 }, priceScope: "Account" },
    { id: "Starter", name: "Starter", amount: 39, currency: "EUR", priceConfigured: true, capabilities: [], priceVersion: "starter-price", priceScope: "Account" },
    { id: "Pro", name: "Pro", amount: 99, currency: "EUR", priceConfigured: true, capabilities: ["training.builder.advanced", "discovery.ranking.priority"], priceVersion: "pro-price", priceScope: "Account", limits: { "video.local_analyses_per_period": null } },
    { id: "Team", name: "Team", amount: 299, currency: "EUR", priceConfigured: true, capabilities: [], priceScope: "Workspace" },
    { id: "Studio", name: "Studio", amount: 699, currency: "EUR", priceConfigured: true, capabilities: [], priceScope: "Workspace" },
  ] : path.endsWith("/mine") ? { teams: [] } : { planId: fixture.current, version: 4, pendingPlanId: null } }),
}));

beforeEach(() => { fixture.current = "Free"; fixture.active = true; fixture.mutate.mockReset(); fixture.mutateAsync.mockReset(); });
function CheckoutProbe() { return <p>checkout: {useLocation().search}</p>; }
function show() { return render(<QueryClientProvider client={new QueryClient()}><MemoryRouter><Routes><Route path="/" element={<Offers />} /><Route path="/app/checkout" element={<CheckoutProbe />} /></Routes></MemoryRouter></QueryClientProvider>); }

it("shows one plan ladder at a time, explicit unlimited and workspace pricing", async () => {
  show();
  expect(screen.getByRole("heading", { name: "Starter" })).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "Studio" })).not.toBeInTheDocument();
  expect(screen.getByText("Unlimited")).toBeInTheDocument();
  expect(screen.getAllByText(/no guaranteed leads/)[0]).toBeInTheDocument();
  await userEvent.click(screen.getByRole("radio", { name: "Teams & studios" }));
  expect(screen.getByRole("heading", { name: "Studio" })).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "Starter" })).not.toBeInTheDocument();
  expect(screen.getAllByText("per workspace / month")).toHaveLength(2);
});

it("shows yearly prices as ten months and holds paid yearly checkout", async () => {
  show();
  await userEvent.click(screen.getByRole("radio", { name: /Yearly/ }));
  expect(screen.getAllByText("per year").length).toBeGreaterThan(0);
  expect(screen.getAllByRole("button", { name: "Yearly billing coming soon" })[0]).toBeDisabled();
});

it("opens the checkout page for a higher plan without paying from the dialog", async () => {
  show();
  await userEvent.click(screen.getByRole("button", { name: "Choose Pro" }));
  expect(fixture.mutateAsync).not.toHaveBeenCalled();
  expect(screen.getByText("checkout: ?plan=Pro")).toBeInTheDocument();
});

it("schedules a lower paid plan without a checkout", async () => {
  fixture.current = "Pro"; show();
  await userEvent.click(screen.getByRole("button", { name: "Schedule at period end: Starter" }));
  expect(fixture.mutate).toHaveBeenCalledWith(expect.objectContaining({ path: "/api/v1/me/platform-subscription/change-plan", json: { planId: "Starter", version: 4 } }), expect.anything());
  expect(fixture.mutateAsync).not.toHaveBeenCalled();
});
