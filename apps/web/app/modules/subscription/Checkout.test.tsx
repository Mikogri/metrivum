import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { beforeEach, expect, it, vi } from "vitest";
import { Checkout } from "./Checkout";

const fixture = vi.hoisted(() => ({ mutateAsync: vi.fn(), active: true }));
vi.mock("~/modules/accounts", () => ({ useProfile: () => ({ roles: ["Coach"] }) }));
vi.mock("~/shared/session/AccountScope", () => ({ useAccountKey: () => "test-account", useAccountContext: () => ({ lifecycle: { isCurrent: () => fixture.active } }) }));
vi.mock("./team-billing", () => ({ TeamCheckout: ({ plan }: { plan: { name: string } }) => <p>Workspace checkout: {plan.name}</p> }));
vi.mock("~/modules/coaching", () => ({
  Failure: () => <p>Failure</p>, MutationError: () => null,
  useCoachingMutation: () => ({ mutate: vi.fn(), mutateAsync: fixture.mutateAsync, isPending: false }),
  useCoachingQuery: (path: string) => ({ isPending: false, isError: false, data: path.endsWith("/plans") ? [
    { id: "Free", name: "Free", amount: 0, currency: "EUR", priceConfigured: true, capabilities: [], priceScope: "Account", tier: 1, topTier: 2 },
    { id: "Pro", name: "Pro", amount: 24, currency: "EUR", priceConfigured: true, capabilities: [], priceVersion: "pro-price", priceScope: "Account", tier: 2, topTier: 2 },
    { id: "Studio", name: "Studio", amount: 159, currency: "EUR", priceConfigured: true, capabilities: [], priceScope: "Workspace", tier: 1, topTier: 1 },
  ] : { planId: "Free", version: 4, pendingPlanId: null } }),
}));

beforeEach(() => { fixture.active = true; fixture.mutateAsync.mockReset(); });
function show(planId = "Pro") { return render(<QueryClientProvider client={new QueryClient()}><MemoryRouter><Checkout planId={planId} /></MemoryRouter></QueryClientProvider>); }
const confirm = () => screen.getByRole("button", { name: "Confirm simulated payment" });
async function agreeAndConfirm() {
  await userEvent.click(screen.getByRole("checkbox", { name: /simulated payment and accept/ }));
  await userEvent.click(confirm());
}

it("requires agreement, then sends the catalog price version and confirms the due", async () => {
  fixture.mutateAsync.mockResolvedValueOnce({ pendingDue: { id: "due-1" } }).mockResolvedValueOnce({ planId: "Pro", status: "Active" });
  show();
  expect(confirm()).toBeDisabled();
  await agreeAndConfirm();
  await waitFor(() => expect(fixture.mutateAsync).toHaveBeenCalledTimes(2));
  expect(fixture.mutateAsync.mock.calls[0]![0].json).toEqual({ planId: "Pro", priceVersion: "pro-price" });
  expect(fixture.mutateAsync.mock.calls[1]![0].json).toMatchObject({ dueId: "due-1", idempotencyKey: expect.any(String) });
  expect(await screen.findByText("You're on Pro")).toBeInTheDocument();
});

it("does not confirm a checkout after the originating account expires", async () => {
  fixture.mutateAsync.mockImplementation(async () => { fixture.active = false; return { pendingDue: { id: "due-1" } }; });
  show();
  await agreeAndConfirm();
  expect(fixture.mutateAsync).toHaveBeenCalledTimes(1);
});

it("retries the same confirmation after a network failure without creating another checkout", async () => {
  fixture.mutateAsync.mockResolvedValueOnce({ pendingDue: { id: "due-1" } }).mockRejectedValueOnce(new Error("network unavailable")).mockResolvedValueOnce({ planId: "Pro", status: "Active" });
  show();
  await agreeAndConfirm();
  await waitFor(() => expect(fixture.mutateAsync).toHaveBeenCalledTimes(2));
  await userEvent.click(confirm());
  await waitFor(() => expect(fixture.mutateAsync).toHaveBeenCalledTimes(3));
  expect(fixture.mutateAsync.mock.calls[2]![0]).toEqual(fixture.mutateAsync.mock.calls[1]![0]);
});

it("uses the workspace checkout for team plans and refuses free or unknown plans", () => {
  show("Studio");
  expect(screen.getByText("Workspace checkout: Studio")).toBeInTheDocument();
});

it("explains when a plan cannot be bought", () => {
  show("Free");
  expect(screen.getByText("This plan can't be bought")).toBeInTheDocument();
});
