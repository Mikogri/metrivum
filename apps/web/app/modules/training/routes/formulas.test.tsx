import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import type { ApiRequest } from "~/shared/http/transport";
import FormulasRoute from "./formulas";

const mocks = vi.hoisted(() => ({
  api: vi.fn<(request: ApiRequest) => Promise<unknown>>(),
  view: "cards",
}));
vi.mock("~/shared/session/AccountScope", () => ({
  useAccountKey: () => "0:coach",
  useApi: () => mocks.api,
}));
vi.mock("~/shared/access", () => ({
  RequireFeature: ({ children }: { children: ReactNode }) => children,
  LockedReason: ({ children }: { children: ReactNode }) => children,
  LockedArea: ({ children }: { children: ReactNode }) => children,
  useFeatureAccess: () => ({ allowed: true, pending: false }),
}));
vi.mock("~/shared/lib/useUrlState", () => ({
  pageFromParam: () => 1,
  useUrlState: () => [{ q: "", page: "1", view: mocks.view }, vi.fn()],
}));

const formulas = [
  { id: "first", name: "First formula", version: 1, archived: false },
  { id: "second", name: "Second formula", version: 1, archived: false },
];
const detail = (id: string) => ({
  data: {
    ...formulas.find((f) => f.id === id),
    definition: {
      expression: "base * 2",
      inputs: { base: "Kg" },
      outputUnit: "Kg",
    },
  },
  version: 1,
});
let cache: QueryClient;
beforeEach(() => {
  mocks.view = "cards";
  mocks.api
    .mockReset()
    .mockImplementation(async ({ path, query }: ApiRequest) => {
      if (path.endsWith("/built-in")) return { data: [] };
      if (path.endsWith("/formulas"))
        return {
          data: {
            items: query?.includeDefinitions
              ? formulas.map((f) => ({
                  ...f,
                  definition: detail(f.id).data.definition,
                }))
              : formulas,
            page: 1,
            pageSize: 20,
            total: 2,
          },
        };
      return detail(path.split("/").at(-1)!);
    });
  cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(() => cache.clear());
function setup() {
  return render(
    <QueryClientProvider client={cache}>
      <FormulasRoute />
    </QueryClientProvider>,
  );
}
const detailCalls = () =>
  mocks.api.mock.calls.filter(([request]: [ApiRequest]) =>
    /formulas\/(first|second)$/.test(request.path),
  );

it("reuses each loaded card definition when opening its editor", async () => {
  setup();
  await screen.findAllByText("base * 2");
  expect(detailCalls()).toHaveLength(0);
  fireEvent.click(screen.getAllByRole("button", { name: "Edit" })[0]!);
  await screen.findByDisplayValue("First formula");
  expect(detailCalls()).toHaveLength(0);
});

it("falls back to detail requests when an older API omits list definitions", async () => {
  mocks.api.mockImplementation(async ({ path }: ApiRequest) => {
    if (path.endsWith("/built-in")) return { data: [] };
    if (path.endsWith("/formulas"))
      return { data: { items: formulas, page: 1, pageSize: 20, total: 2 } };
    return detail(path.split("/").at(-1)!);
  });
  setup();
  await screen.findAllByText("base * 2");
  expect(detailCalls()).toHaveLength(2);
});

it("does not start per-card requests when switching from a light list to cards", async () => {
  mocks.view = "list";
  const view = setup();
  await screen.findByText("First formula");
  expect(detailCalls()).toHaveLength(0);
  mocks.view = "cards";
  view.rerender(
    <QueryClientProvider client={cache}>
      <FormulasRoute />
    </QueryClientProvider>,
  );
  await screen.findAllByText("base * 2");
  expect(detailCalls()).toHaveLength(0);
  const lists = mocks.api.mock.calls.filter(([r]) =>
    r.path.endsWith("/formulas"),
  );
  expect(lists).toHaveLength(2);
  expect(lists[1]![0].query?.includeDefinitions).toBe(true);
});

it("refreshes card definitions through the list when the formula collection is invalidated", async () => {
  setup();
  await screen.findAllByText("base * 2");
  mocks.api.mockImplementation(async ({ path }: ApiRequest) => {
    if (path.endsWith("/built-in")) return { data: [] };
    if (path.endsWith("/formulas"))
      return {
        data: {
          items: formulas.map((f) => ({
            ...f,
            definition: {
              ...detail(f.id).data.definition,
              expression: "base * 3",
            },
          })),
          page: 1,
          pageSize: 20,
          total: 2,
        },
      };
    return detail(path.split("/").at(-1)!);
  });
  await act(() =>
    cache.invalidateQueries({ queryKey: ["0:coach", "training", "formulas"] }),
  );
  await waitFor(() =>
    expect(
      mocks.api.mock.calls.filter(([r]) => r.path.endsWith("/formulas")),
    ).toHaveLength(2),
  );
  await screen.findAllByText("base * 3");
  expect(detailCalls()).toHaveLength(0);
  expect(
    mocks.api.mock.calls
      .filter(([r]) => r.path.endsWith("/formulas"))
      .every(
        ([request]: [ApiRequest]) => request.signal instanceof AbortSignal,
      ),
  ).toBe(true);
});

it("preserves a formula draft while its cached definition refreshes", async () => {
  setup();
  await screen.findAllByText("base * 2");
  fireEvent.click(screen.getAllByRole("button", { name: "Edit" })[0]!);
  fireEvent.change(await screen.findByDisplayValue("First formula"), {
    target: { value: "Unsaved name" },
  });
  await act(async () => {
    cache.setQueryData(
      ["0:coach", "training", "formulas", "detail", "first", 1],
      {
        ...detail("first"),
        data: { ...detail("first").data, name: "Remote name" },
      },
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  expect(screen.getByDisplayValue("Unsaved name")).toBeInTheDocument();
});

it("cancels a closed editor's request without populating the next editor", async () => {
  mocks.view = "list";
  let release!: (value: unknown) => void;
  mocks.api.mockImplementation(({ path }: ApiRequest) => {
    if (path.endsWith("/built-in")) return Promise.resolve({ data: [] });
    if (path.endsWith("/formulas"))
      return Promise.resolve({ data: { items: formulas, total: 2 } });
    if (path.endsWith("/first"))
      return new Promise((resolve) => {
        release = resolve;
      });
    return Promise.resolve(detail("second"));
  });
  setup();
  fireEvent.click((await screen.findAllByRole("button", { name: "Edit" }))[0]!);
  await waitFor(() => expect(detailCalls()).toHaveLength(1));
  const signal = detailCalls()[0]![0].signal;
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  fireEvent.click(screen.getAllByRole("button", { name: "Edit" })[1]!);
  await screen.findByDisplayValue("Second formula");
  await act(async () => {
    release(detail("first"));
  });
  expect(signal?.aborted).toBe(true);
  expect(screen.getByDisplayValue("Second formula")).toBeInTheDocument();
  expect(screen.queryByDisplayValue("First formula")).not.toBeInTheDocument();
});
