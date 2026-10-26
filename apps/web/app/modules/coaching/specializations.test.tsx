import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ApiRequest } from "~/shared/http/transport";
import { CoachSpecializationsCard, SpecializationSelector, SpecializationsEditor, specializationsKey, type SpecializationDraft } from "./specializations";

const mocks = vi.hoisted(() => ({ api: vi.fn<(request: ApiRequest) => Promise<unknown>>(), current: true, mode: "coach" }));
vi.mock("~/shared/session/WorkspaceScope", () => ({ useWorkspace: () => ({ mode: mocks.mode }) }));
vi.mock("~/shared/session/AccountScope", () => ({ useApi: () => mocks.api, useAccountKey: () => "account", useAccountContext: () => ({ api: mocks.api, accountKey: "account", lifecycle: { isCurrent: () => mocks.current } }) }));
const items = ["Strength Training", "Powerlifting", "Olympic Weightlifting", "Hypertrophy", "Bodybuilding", "Strongman"];
const codes = ["strength_training", "powerlifting", "olympic_weightlifting", "hypertrophy", "bodybuilding", "strongman"];
const categories = [{ code: "strength_muscle", name: "Strength & Muscle", sortOrder: 1, specializations: items.map((name, sortOrder) => ({ code: codes[sortOrder]!, name, sortOrder })) }];
let cache: QueryClient;
let saved: { selectedCodes: string[]; primaryCodes: string[]; version: number };
beforeEach(() => {
  cache = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  mocks.current = true;
  mocks.mode = "coach";
  saved = { selectedCodes: [], primaryCodes: [], version: 0 };
  mocks.api.mockReset().mockImplementation(async request => {
    if (request.path === "/api/v1/coaching/specializations") return { data: categories };
    if (request.method === "PUT") saved = { ...(request.json as typeof saved), version: saved.version + 1 };
    return { data: saved };
  });
});
afterEach(() => cache.clear());
function Selector({ filter = false }: { filter?: boolean }) {
  const [value, onChange] = useState<SpecializationDraft>({ selectedCodes: [], primaryCodes: [] });
  return <SpecializationSelector categories={categories} value={value} onChange={onChange} filter={filter} />;
}
function editor() { return <QueryClientProvider client={cache}><SpecializationsEditor /></QueryClientProvider>; }

it("limits selections to five and primary to three while allowing removal", async () => {
  render(<Selector />);
  for (const name of items.slice(0, 5)) await userEvent.click(screen.getByRole("checkbox", { name }));
  expect(screen.getByText("5/5 selected")).toBeInTheDocument();
  expect(screen.getByRole("checkbox", { name: "Strongman" })).toBeDisabled();
  for (const name of items.slice(0, 3)) await userEvent.click(screen.getByRole("checkbox", { name: `Mark ${name} as primary` }));
  expect(screen.getByText("3/3 primary")).toBeInTheDocument();
  expect(screen.getByRole("checkbox", { name: "Mark Hypertrophy as primary" })).toBeDisabled();
  await userEvent.click(screen.getByRole("button", { name: "Remove Powerlifting" }));
  expect(screen.getByText("4/5 selected")).toBeInTheDocument();
  expect(screen.getByText("2/3 primary")).toBeInTheDocument();
  expect(screen.getByRole("checkbox", { name: "Strongman" })).toBeEnabled();
});

it("searches English labels and code-derived terms without making categories selectable", async () => {
  render(<Selector filter />);
  await userEvent.type(screen.getByRole("searchbox"), "olympic weightlifting");
  expect(screen.getAllByRole("checkbox")).toHaveLength(1);
  await userEvent.clear(screen.getByRole("searchbox"));
  await userEvent.type(screen.getByRole("searchbox"), "olympic_weightlifting");
  expect(screen.getAllByRole("checkbox")).toHaveLength(1);
  await userEvent.click(screen.getByRole("checkbox", { name: "Olympic Weightlifting" }));
  expect(screen.getByText("1/5 selected")).toBeInTheDocument();
  expect(screen.queryByText("0/3 primary")).not.toBeInTheDocument();
});

it("saves canonical choices with the version and reloads the persisted primary selection", async () => {
  const view = render(editor());
  await userEvent.click(await screen.findByRole("checkbox", { name: "Strength Training" }));
  await userEvent.click(screen.getByRole("checkbox", { name: "Mark Strength Training as primary" }));
  await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
  await screen.findByText("Coaching specializations saved.");
  expect(mocks.api.mock.calls.find(([request]) => request.method === "PUT")?.[0].json).toEqual({ selectedCodes: ["strength_training"], primaryCodes: ["strength_training"], version: 0 });
  view.unmount();
  cache.clear();
  render(editor());
  await waitFor(() => expect(screen.getByRole("checkbox", { name: "Strength Training" })).toBeChecked());
  expect(screen.getByRole("checkbox", { name: "Mark Strength Training as primary" })).toBeChecked();
});

it("does not publish a completed mutation into an expired account lifetime", async () => {
  render(editor());
  await screen.findByRole("checkbox", { name: "Strength Training" });
  mocks.current = false;
  await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(mocks.api.mock.calls.some(([request]) => request.method === "PUT")).toBe(true));
  expect(screen.queryByText("Coaching specializations saved.")).not.toBeInTheDocument();
});

it("keeps the draft version when a background refetch discovers another edit", async () => {
  render(editor());
  await userEvent.click(await screen.findByRole("checkbox", { name: "Powerlifting" }));
  cache.setQueryData(specializationsKey("account"), { selectedCodes: ["hypertrophy"], primaryCodes: [], version: 7 });
  await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(mocks.api.mock.calls.some(([request]) => request.method === "PUT")).toBe(true));
  expect(mocks.api.mock.calls.find(([request]) => request.method === "PUT")?.[0].json).toMatchObject({ selectedCodes: ["powerlifting"], version: 0 });
});

it("keeps public specialties readable but hides coach edit actions in Client perspective", () => {
  mocks.mode = "client";
  render(<QueryClientProvider client={cache}><CoachSpecializationsCard editable initialEditing selections={[{ code: "powerlifting", name: "Powerlifting", categoryCode: "strength_muscle", isPrimary: true }]} /><SpecializationsEditor /></QueryClientProvider>);
  expect(screen.getByText(/Powerlifting/)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Edit specializations" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Save changes" })).not.toBeInTheDocument();
  expect(mocks.api).not.toHaveBeenCalled();
});
