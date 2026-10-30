import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ApiRequest } from "~/shared/http/transport";
import { DiscoverCoaches } from "./discovery";

const mocks = vi.hoisted(() => ({ api: vi.fn<(request: ApiRequest) => Promise<unknown>>(), roles: ["Client"] as string[], mode: "client" }));
vi.mock("~/shared/session/AccountScope", () => ({ useApi: () => mocks.api, useAccountKey: () => "discovery-account", useAccountContext: () => ({ api: mocks.api, accountKey: "discovery-account", lifecycle: { isCurrent: () => true } }) }));
vi.mock("~/shared/session/WorkspaceScope", () => ({ useWorkspace: () => ({ mode: mocks.mode }) }));
vi.mock("~/modules/accounts", () => ({ useProfile: () => ({ roles: mocks.roles }) }));
vi.mock("~/shared/access", () => ({ useFeatureAccess: () => ({ state: "plan_required", allowed: false, pending: false }) }));

const coach = (coachId: string, featured = false) => ({ coachId, username: coachId, displayName: coachId, bio: null, specializations: ["Strength"], specializationSelections: [], languages: ["en"], modes: ["Online"], location: "Warsaw", featured, offer: null });
let cache: QueryClient;
beforeEach(() => {
  mocks.roles = ["Client"];
  mocks.mode = "client";
  mocks.api.mockReset().mockImplementation(async ({ path }) => ({ data: path === "/api/v1/coaching/specializations" ? [{ code: "strength_muscle", name: "Strength & Muscle", sortOrder: 1, specializations: [{ code: "powerlifting", name: "Powerlifting", sortOrder: 1 }, { code: "hypertrophy", name: "Hypertrophy", sortOrder: 2 }] }] : path === "/api/v1/me/coaching-specializations" ? { selectedCodes: [], primaryCodes: [], version: 0 } : path === "/api/v1/me/discovery" ? { published: false, specializations: [], languages: [], modes: [], location: null, version: 0 } : { items: [coach("Premium coach", true), coach("Free coach")], page: 1, pageSize: 18, total: 2 } }));
  cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(() => cache.clear());
function setup() { return render(<QueryClientProvider client={cache}><MemoryRouter initialEntries={["/app/discover"]}><DiscoverCoaches /></MemoryRouter></QueryClientProvider>); }

it("labels paid placement while preserving the server relevance order", async () => {
  setup();
  await screen.findByText("Premium coach");
  expect(screen.getByText(/Featured.*Pro\+/)).toBeInTheDocument();
  expect(within(screen.getByRole("region", { name: "All coaches" })).getByText("Free coach")).toBeInTheDocument();
  expect(screen.getAllByText("Premium coach")).toHaveLength(1);
  expect(screen.queryByText("Priority among relevant matches")).not.toBeInTheDocument();
  expect(screen.queryByText("Your Discovery listing")).not.toBeInTheDocument();
});

it("gives coach and dual-role accounts one opt-in listing editor", async () => {
  mocks.roles = ["Coach", "Client"];
  mocks.mode = "coach";
  setup();
  await userEvent.click(screen.getByText("Your Discovery listing"));
  const publish = await screen.findByRole("checkbox", { name: "Publish in Discovery" });
  expect(publish).not.toBeChecked();
  expect(screen.getAllByText("Your Discovery listing")).toHaveLength(1);
  expect(screen.getByText(/private address is never copied/)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /Priority among relevant matches/ })).toHaveAttribute("href", "/app/subscription");
});

it("lets a dual-role coach search in Client perspective without coach listing edit actions", async () => {
  mocks.roles = ["Coach", "Client"];
  setup();
  await screen.findByText("Premium coach");
  expect(screen.queryByText("Your Discovery listing")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Edit specializations" })).not.toBeInTheDocument();
  expect(mocks.api.mock.calls.some(([request]) => request.path === "/api/v1/me/coaching-specializations")).toBe(false);
});

it("shows the empty state from the server and keeps filters in requests", async () => {
  mocks.api.mockImplementation(async ({ path }) => ({ data: path === "/api/v1/coaching/specializations" ? [] : { items: [], page: 1, pageSize: 18, total: 0 } }));
  setup();
  await screen.findByText("No coaches match");
  await userEvent.click(screen.getByRole("checkbox", { name: "Has published offers" }));
  expect(mocks.api.mock.calls.at(-1)?.[0]).toMatchObject({ path: "/api/v1/discovery/coaches", query: { hasOffers: true, page: 1, pageSize: 18 } });
});


it("keeps relevance order when a standard coach precedes a promoted coach", async () => {
  mocks.api.mockImplementation(async ({ path }) => ({ data: path === "/api/v1/coaching/specializations" ? [] : { items: [coach("Relevant free coach"), coach("Less relevant premium coach", true)], page: 1, pageSize: 18, total: 2 } }));
  setup();
  await screen.findByText("Relevant free coach");
  const cards = within(screen.getByRole("region", { name: "All coaches" })).getAllByRole("article");
  expect(within(cards[0]!).getByText("Relevant free coach")).toBeInTheDocument();
  expect(within(cards[1]!).getByText("Less relevant premium coach")).toBeInTheDocument();
});

it("sends canonical multi-select OR filters and composes existing filters", async () => {
  setup();
  await screen.findByText("Free coach");
  await userEvent.click(screen.getByText("Specialization", { selector: "summary" }));
  for (const name of ["Powerlifting", "Hypertrophy"]) {
    await userEvent.click(await screen.findByRole("combobox", { name: /specialization/i }));
    await userEvent.type(screen.getByRole("combobox", { name: /specialization/i }), name);
    await userEvent.click(await screen.findByRole("option", { name: new RegExp(`^${name}`) }));
  }
  await userEvent.type(screen.getByRole("textbox", { name: "Public location" }), "Warsaw");
  await userEvent.click(screen.getByRole("checkbox", { name: "Has published offers" }));
  await waitFor(() => expect(mocks.api.mock.calls.filter(([request]) => request.path === "/api/v1/discovery/coaches").at(-1)?.[0].query).toMatchObject({ specializations: "powerlifting,hypertrophy", location: "Warsaw", hasOffers: true, page: 1 }));
  await userEvent.click(screen.getByRole("button", { name: "Clear filters" }));
  expect(screen.getByRole("status")).toHaveTextContent("0/10 selected");
});

it("debounces text search instead of requesting every typed character", async () => {
  setup();
  await screen.findByText("Free coach");
  mocks.api.mockClear();
  await userEvent.type(screen.getByRole("searchbox", { name: "Name, username, introduction or specialization" }), "Powerlifting");
  await waitFor(() => expect(mocks.api.mock.calls.some(([request]) => request.query?.search === "Powerlifting")).toBe(true));
  expect(mocks.api.mock.calls.filter(([request]) => request.path === "/api/v1/discovery/coaches" && request.query?.search).map(([request]) => request.query?.search)).toEqual(["Powerlifting"]);
});
