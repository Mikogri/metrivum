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
const items = ["Strength Training", "Powerlifting", "Olympic Weightlifting", "Hypertrophy", "Bodybuilding", "Strongman", "Calisthenics", "Aerobic Conditioning", "Interval Training", "Endurance Training", "Hybrid Training"];
const codes = items.map(name => name.toLowerCase().replaceAll(" ", "_"));
const categories = [
  { code: "strength_muscle", name: "Strength & Muscle", sortOrder: 1, specializations: items.slice(0, 7).map((name, sortOrder) => ({ code: codes[sortOrder]!, name, sortOrder })) },
  { code: "endurance", name: "Endurance & Conditioning", sortOrder: 2, specializations: items.slice(7).map((name, sortOrder) => ({ code: codes[sortOrder + 7]!, name, sortOrder })) },
];
/** Picks a specialization from the searchable list. */
async function pick(name: string) {
  await userEvent.click(screen.getByRole("combobox"));
  await userEvent.type(screen.getByRole("combobox"), name);
  await userEvent.click(await screen.findByRole("option", { name: new RegExp(`^${name}`) }));
}
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

it("finds a specialization by its code", async () => {
  render(<Selector />);
  await userEvent.click(screen.getByRole("combobox"));
  await userEvent.type(screen.getByRole("combobox"), "strongman");
  expect((await screen.findAllByRole("option")).map(option => option.textContent)).toEqual(["StrongmanStrength & Muscle"]);
});

it("limits selections to ten, makes new picks primary while five are free, and allows removal", async () => {
  render(<Selector />);
  for (const name of items.slice(0, 10)) await pick(name);
  expect(screen.getByRole("status")).toHaveTextContent("10/10 selected");
  expect(screen.getByRole("status")).toHaveTextContent("5/5 primary");
  expect(screen.getByRole("combobox")).toBeDisabled();
  // The first five are primary by default; the sixth is not and cannot become primary while five are.
  expect(screen.getByRole("button", { name: "Mark Strength Training as primary" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "Mark Strongman as primary" })).toHaveAttribute("aria-pressed", "false");
  expect(screen.getByRole("button", { name: "Mark Strongman as primary" })).toHaveAttribute("aria-disabled", "true");
  await userEvent.click(screen.getByRole("button", { name: "Remove Powerlifting" }));
  expect(screen.getByRole("status")).toHaveTextContent("9/10 selected");
  expect(screen.getByRole("status")).toHaveTextContent("4/5 primary");
  await userEvent.click(screen.getByRole("button", { name: "Mark Strongman as primary" }));
  expect(screen.getByRole("status")).toHaveTextContent("5/5 primary");
}, 20_000);

it("searches English labels and code-derived terms and has no primary choice when filtering", async () => {
  render(<Selector filter />);
  await userEvent.click(screen.getByRole("combobox"));
  await userEvent.type(screen.getByRole("combobox"), "olympic weightlifting");
  expect((await screen.findAllByRole("option")).map(option => option.textContent)).toEqual(["Olympic WeightliftingStrength & Muscle"]);
  await userEvent.click(screen.getByRole("option", { name: /^Olympic Weightlifting/ }));
  expect(screen.getByRole("status")).toHaveTextContent("1/10 selected");
  expect(screen.getByRole("status")).not.toHaveTextContent("primary");
});

it("saves canonical choices with the version and reloads the persisted primary selection", async () => {
  const view = render(editor());
  await screen.findByRole("combobox");
  await pick("Strength Training");
  await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
  await screen.findByText("Coaching specializations saved.");
  expect(mocks.api.mock.calls.find(([request]) => request.method === "PUT")?.[0].json).toEqual({ selectedCodes: ["strength_training"], primaryCodes: ["strength_training"], version: 0 });
  view.unmount();
  cache.clear();
  render(editor());
  await waitFor(() => expect(screen.getByRole("button", { name: "Remove Strength Training" })).toBeInTheDocument());
  expect(screen.getByRole("button", { name: "Mark Strength Training as primary" })).toHaveAttribute("aria-pressed", "true");
});

it("does not publish a completed mutation into an expired account lifetime", async () => {
  render(editor());
  await screen.findByRole("combobox");
  mocks.current = false;
  await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(mocks.api.mock.calls.some(([request]) => request.method === "PUT")).toBe(true));
  expect(screen.queryByText("Coaching specializations saved.")).not.toBeInTheDocument();
});

it("keeps the draft version when a background refetch discovers another edit", async () => {
  render(editor());
  await screen.findByRole("combobox");
  await pick("Powerlifting");
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
