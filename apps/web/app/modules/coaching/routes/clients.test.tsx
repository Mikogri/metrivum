import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ApiRequest } from "~/shared/http/transport";
import ClientsRoute from "./clients";

const mocks = vi.hoisted(() => ({
  api: vi.fn<(request: ApiRequest) => Promise<unknown>>(),
  account: "coach",
}));
vi.mock("~/shared/session/AccountScope", () => ({
  useApi: () => mocks.api,
  useAccountKey: () => mocks.account,
}));
vi.mock("~/shared/session/WorkspaceScope", () => ({
  useWorkspace: () => ({ mode: "coach" }),
}));
vi.mock("~/shared/access", () => ({
  RequireFeature: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("../hub-actions", () => ({ ClientHubActions: () => null }));
vi.mock("~/shared/navigation/HubNavigation", () => ({
  HubNavigation: () => null,
}));

const clients = Array.from({ length: 20 }, (_, i) => ({
  id: `relationship-${String(i).padStart(2, "0")}`,
  client: { displayName: `Client ${i}`, username: `client${i}` },
  status: "Active",
  groupIds: [],
  startedAt: "2026-01-01T00:00:00Z",
}));
const services = clients.map((client, i) => ({
  relationshipId: client.id,
  offerName: `Offer ${i}`,
  currentBilling: { status: "Paid" },
}));
const page = (items: unknown[]) => ({
  items,
  total: items.length,
  page: 1,
  pageSize: 20,
});
let cache: QueryClient;
beforeEach(() => {
  mocks.account = "coach";
  mocks.api.mockReset().mockImplementation(async ({ path }: ApiRequest) => {
    if (path === "/api/v1/coaching/clients") return { data: page(clients) };
    if (path === "/api/v1/coaching/services/current") return { data: services };
    if (path === "/api/v1/offers/categories") return { data: [] };
    const id = path.match(/relationships\/([^/]+)\/services$/)?.[1];
    return {
      data: page(id ? services.filter((s) => s.relationshipId === id) : []),
    };
  });
  cache = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 30_000 } },
  });
});
afterEach(() => cache.clear());
function setup(view = "list") {
  return render(tree(view));
}
function tree(view = "list") {
  return (
    <QueryClientProvider client={cache}>
      <MemoryRouter initialEntries={[`/app/clients?view=${view}`]}>
        <ClientsRoute />
      </MemoryRouter>
    </QueryClientProvider>
  );
}
const serviceCalls = () =>
  mocks.api.mock.calls.filter(([request]) =>
    request.path.includes("/services"),
  );

it.each(["list", "cards"])(
  "fetches current services once for twenty visible clients in %s view",
  async (view) => {
    setup(view);
    // The table shows the offer; the card shows the client, their start date, mode and plan status.
    await screen.findByText(view === "list" ? "Offer 19" : "Client 19");
    await waitFor(() => expect(serviceCalls()).toHaveLength(1));
    expect(serviceCalls()[0]![0]).toMatchObject({
      path: "/api/v1/coaching/services/current",
      query: { relationshipIds: clients.map((client) => client.id) },
    });
    expect(serviceCalls()[0]![0].signal).toBeInstanceOf(AbortSignal);
    if (view === "list") expect(screen.getAllByText("Paid")).toHaveLength(20);
  },
);

it("does not fetch service summaries for an empty client page", async () => {
  mocks.api.mockImplementation(async ({ path }: ApiRequest) => ({
    data: path === "/api/v1/offers/categories" ? [] : page([]),
  }));
  setup();
  await screen.findByText("Your first collaboration starts here");
  expect(serviceCalls()).toHaveLength(0);
});

it("shares summary refreshes with coaching invalidation and keeps account cache keys", async () => {
  setup();
  await screen.findByText("Offer 19");
  await act(() => cache.invalidateQueries({ queryKey: ["coach", "coaching"] }));
  await waitFor(() => expect(serviceCalls()).toHaveLength(2));
  expect(
    cache.getQueryCache().findAll({
      queryKey: [
        "coach",
        "coaching",
        "coach",
        "/api/v1/coaching/services/current",
      ],
      type: "active",
    }),
  ).toHaveLength(1);
  expect(
    cache.getQueryCache().findAll({ queryKey: ["other", "coaching"] }),
  ).toHaveLength(0);
});

it("keeps pending and absent-service cells visually unchanged", async () => {
  let release!: (value: unknown) => void;
  const respond = mocks.api.getMockImplementation()!;
  mocks.api.mockImplementation((request) =>
    request.path.endsWith("/services/current")
      ? new Promise((resolve) => {
          release = resolve;
        })
      : respond(request),
  );
  setup();
  await screen.findByText("Client 19");
  expect(screen.getAllByText("…")).toHaveLength(20);
  await act(async () => {
    release({ data: [services[0]] });
  });
  await screen.findByText("Offer 0");
  expect(screen.getAllByText("Paid")).toHaveLength(1);
  expect(screen.queryByText("Offer 19")).not.toBeInTheDocument();
  expect(screen.queryByText("…")).not.toBeInTheDocument();
});

it("ignores a previous account's delayed summary after switching accounts", async () => {
  let release!: (value: unknown) => void;
  const respond = mocks.api.getMockImplementation()!;
  mocks.api.mockImplementation((request) => {
    if (request.path.endsWith("/services/current")) {
      return mocks.account === "coach"
        ? new Promise((resolve) => {
            release = resolve;
          })
        : Promise.resolve({
            data: [{ ...services[0], offerName: "Other account offer" }],
          });
    }
    return respond(request);
  });
  const { rerender } = setup();
  await waitFor(() => expect(serviceCalls()).toHaveLength(1));
  const oldSignal = serviceCalls()[0]![0].signal;
  mocks.account = "other";
  rerender(tree());
  await screen.findByText("Other account offer");
  await act(async () => {
    release({ data: services });
  });
  expect(oldSignal?.aborted).toBe(true);
  expect(screen.queryByText("Offer 0")).not.toBeInTheDocument();
  expect(screen.getByText("Other account offer")).toBeInTheDocument();
});
