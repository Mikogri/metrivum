import type { ReactNode } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, expect, it, vi } from "vitest";
import ScheduleRoute from "./schedule";

const state = vi.hoisted(() => ({ mutate: vi.fn(), programs: [] as unknown[] }));
vi.mock("../api", () => ({
  useCoachingQuery: (path: string) => ({ data: path.endsWith("assigned-programs") ? state.programs : { items: [{ id: "form", name: "Published", currentPublishedVersionId: "v1" }] }, isPending: false }),
  useCoachingMutation: () => ({ mutate: state.mutate, isPending: false }),
}));
vi.mock("~/shared/access", () => ({ RequireFeature: ({ children }: { children: ReactNode }) => children }));
vi.mock("~/modules/accounts", () => ({ timeZones: () => ["UTC", "Europe/Warsaw"] }));
vi.mock("~/shared/session/dirty-guard", () => ({ useUnsavedWorkGuard: () => {} }));
vi.mock("~/shared/lib/useConfirm", () => ({ useDangerConfirm: () => ({ ask: vi.fn() }), useDiscardConfirm: () => ({ confirm: vi.fn() }) }));
vi.mock("../recipients", () => ({ RecipientPicker: () => null }));
vi.mock("../components", () => ({ DraftNavigationGuard: () => null, MutationError: () => null, StatusBadge: () => null, Failure: () => null, Loading: () => null, EditableResource: () => null }));

beforeEach(() => { state.mutate.mockClear(); state.programs = []; });
function open() { render(<MemoryRouter initialEntries={["/app/check-in-schedules/new?relationshipId=client&date=2026-10-16"]}><ScheduleRoute /></MemoryRouter>); }

it("submits the edited release time and blocks an empty value", async () => {
  open();
  await userEvent.type(screen.getByRole("textbox", { name: /^Name/ }), "Progress");
  const time = screen.getByLabelText(/^Release time/);
  fireEvent.change(time, { target: { value: "18:45" } });
  await userEvent.click(screen.getByRole("button", { name: "Create schedule" }));
  expect(state.mutate).toHaveBeenCalledWith(expect.objectContaining({ json: expect.objectContaining({ recurrence: expect.objectContaining({ releaseTime: "18:45:00" }) }) }));
  fireEvent.change(time, { target: { value: "" } });
  expect(screen.getByRole("button", { name: "Create schedule" })).toBeDisabled();
});

it("offers ten cycle days only for an assigned program and sends its time zone", async () => {
  state.programs = [{ assignmentId: "assignment", relationshipId: "client", programName: "Ten days", timeZone: "Europe/Warsaw", cycles: [{ cycleId: "cycle", startDate: "2026-10-16", dayCount: 10 }] }];
  open();
  await userEvent.type(screen.getByRole("textbox", { name: /^Name/ }), "Progress");
  await userEvent.click(screen.getByRole("radio", { name: "Program cycle" }));
  expect(screen.getByRole("button", { name: "Day 10" })).toBeVisible();
  expect(screen.queryByRole("button", { name: "Day 11" })).toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "Day 10" }));
  await userEvent.click(screen.getByRole("button", { name: "Create schedule" }));
  expect(state.mutate).toHaveBeenCalledWith(expect.objectContaining({ json: expect.objectContaining({ timeZone: "Europe/Warsaw", recurrence: expect.objectContaining({ kind: "AssignedProgramCycle", assignmentId: "assignment", cycleDays: [1, 10] }) }) }));
});

it("explains unavailable program cycles without allowing selection", () => {
  open();
  expect(screen.getByRole("radio", { name: "Program cycle" })).toBeDisabled();
  expect(screen.getByText(/Select one client with an active assigned program/)).toBeVisible();
});
