import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { beforeEach, expect, it, vi } from "vitest";
import { Offers, SubscriptionButton } from "./SubscriptionPanel";

const fixture = vi.hoisted(() => ({ current: "Free", mutate: vi.fn(), mutateAsync: vi.fn(), active: true, upgradeTarget: null as Record<string, unknown> | null,
  roles: ["Coach"] as string[], mode: "coach", api: vi.fn(), switchMode: vi.fn() }));
vi.mock("./upgrade", () => ({ useUpgrade: () => ({ available: true, target: fixture.upgradeTarget }) }));
vi.mock("~/modules/accounts", () => ({
  profileKey: (account: string) => [account, "me"],
  useProfile: () => ({ roles: fixture.roles, username: "member", birthDate: "1990-01-01", displayName: "Member One", firstName: "Member", lastName: "One", locale: "en", timeZone: "Europe/Warsaw" }),
}));
vi.mock("~/shared/session/AccountScope", () => ({ useAccountKey: () => "test-account", useApi: () => fixture.api }));
vi.mock("~/shared/session/WorkspaceScope", () => ({ useWorkspace: () => ({ mode: fixture.mode, canCoach: fixture.roles.includes("Coach"), switching: false, switchMode: fixture.switchMode }) }));
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

beforeEach(() => {
  fixture.current = "Free"; fixture.active = true; fixture.upgradeTarget = null; fixture.mutate.mockReset(); fixture.mutateAsync.mockReset();
  fixture.roles = ["Coach"]; fixture.mode = "coach"; fixture.api.mockReset(); fixture.switchMode.mockReset();
});
function CheckoutProbe() { return <p>checkout: {useLocation().search}</p>; }
function show() { return render(<QueryClientProvider client={new QueryClient()}><MemoryRouter><Routes><Route path="/" element={<Offers />} /><Route path="/app/checkout" element={<CheckoutProbe />} /></Routes></MemoryRouter></QueryClientProvider>); }

it("shows one plan ladder at a time, explicit unlimited and workspace pricing", async () => {
  show();
  expect(screen.getByRole("heading", { name: "Starter" })).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "Studio" })).not.toBeInTheDocument();
  expect(screen.getByText("Unlimited")).toBeInTheDocument();
  // Discovery priority is hidden while Discovery is switched off.
  expect(screen.queryByText(/no guaranteed leads/)).toBeNull();
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


it("opens the named personal upgrade directly on the first click", async () => {
  fixture.upgradeTarget = { id: "Pro", name: "Pro", priceConfigured: true, amount: 24, priceScope: "Account" };
  render(<MemoryRouter><Routes><Route path="/" element={<SubscriptionButton label="Subscription" />} /><Route path="/app/checkout" element={<CheckoutProbe />} /></Routes></MemoryRouter>);
  await userEvent.click(screen.getByRole("button", { name: "Upgrade to Pro" }));
  expect(screen.getByText("checkout: ?plan=Pro")).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "Plans" })).toBeNull();
  expect(fixture.mutate).not.toHaveBeenCalled();
  expect(fixture.mutateAsync).not.toHaveBeenCalled();
});

it("keeps workspace upgrades in the chooser without promising a direct personal purchase", async () => {
  fixture.upgradeTarget = { id: "Studio", name: "Studio", priceConfigured: true, amount: 159, priceScope: "Workspace" };
  render(<QueryClientProvider client={new QueryClient()}><MemoryRouter><SubscriptionButton label="Subscription" /></MemoryRouter></QueryClientProvider>);
  await userEvent.click(screen.getByRole("button", { name: /^Upgrade$/ }));
  expect(await screen.findByRole("heading", { name: "Plans" })).toBeInTheDocument();
  expect(fixture.mutate).not.toHaveBeenCalled();
});

it("says on every plan that it includes a coach account", () => {
  show();
  expect(screen.getAllByText("Coach account included")).toHaveLength(3);
});

it("puts a client account on no plan and explains that choosing one adds a coach account", async () => {
  fixture.roles = ["Client"];
  fixture.mode = "client";
  fixture.api.mockResolvedValue({ data: { roles: ["Client", "Coach"] } });
  show();
  expect(screen.queryByText("Current plan")).toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "Choose Pro" }));
  expect(await screen.findByText("Your account becomes a coach account")).toBeInTheDocument();
  expect(screen.getByText(/keep everything you have as a client/)).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Continue as coach" }));
  expect(fixture.api).toHaveBeenCalledWith(expect.objectContaining({ method: "PUT", path: "/api/v1/me/roles/coach/onboarding",
    json: expect.objectContaining({ role: "Coach", username: "member", birthDate: "1990-01-01", acceptedTerms: true }) }));
  expect(fixture.mutate).not.toHaveBeenCalled();
});

it("sends a coach in the client view to the coach workspace before the checkout", async () => {
  fixture.mode = "client";
  show();
  await userEvent.click(screen.getByRole("button", { name: "Choose Starter" }));
  expect(await screen.findByText("Plans belong to your coach account")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Continue as coach" }));
  expect(fixture.api).not.toHaveBeenCalled();
  expect(fixture.switchMode).toHaveBeenCalledWith("coach", "/app/checkout?plan=Starter");
});
