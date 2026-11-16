import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, expect, it, vi } from "vitest";
import TrainingHome, {
  MobileWorkoutRows,
  TrainingSchedule,
  type Occurrence,
} from "./TrainingHome";
const state = vi.hoisted(() => ({
  mobile: true,
  filters: {} as Record<string, unknown>,
}));
beforeEach(() => {
  state.mobile = true;
  state.filters = {};
});
vi.mock("@portable-ui/react", async (original) => ({
  ...(await original<object>()),
  useMobileLayout: () => state.mobile,
}));
vi.mock("~/shared/session/WorkspaceScope", () => ({
  useWorkspace: () => ({ mode: "client" }),
}));
vi.mock("~/modules/coaching", () => ({
  useCoachingQuery: (_path: string, filters: Record<string, unknown>) => {
    state.filters = filters;
    return { isPending: false, isError: false, data: { items: [], total: 0 } };
  },
  EmptyState: () => null,
  Loading: () => null,
  Failure: () => null,
  ListPagination: () => null,
  StatusBadge: () => null,
}));
vi.mock("./Assignments", () => ({
  AssignmentList: () => null,
  localDate: () => "2026-10-12",
}));
vi.mock("./Progress", () => ({
  TrainingProgress: () => <div>Training progress content</div>,
}));
vi.mock("../purchases/TrainingPlans", () => ({
  TrainingPlansTab: () => <div>Assigned and owned plans</div>,
}));
it("opens the History deep link on All workouts, with Workouts and Progress", async () => {
  render(
    <MemoryRouter initialEntries={["/app/my-training?tab=history"]}>
      <TrainingHome />
    </MemoryRouter>,
  );
  expect(screen.getByRole("heading", { name: "Training" })).toBeInTheDocument();
  expect(screen.getByRole("tab", { name: "All workouts" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  expect(
    screen.getByRole("region", { name: "Workout schedule and history" }),
  ).toBeInTheDocument();
  await userEvent.click(screen.getByRole("radio", { name: "Progress" }));
  expect(screen.getByText("Training progress content")).toBeInTheDocument();
});
it("opens the old Plans link on the whole plan, with the plans the client owns", () => {
  render(
    <MemoryRouter initialEntries={["/app/my-training?tab=plans"]}>
      <TrainingHome />
    </MemoryRouter>,
  );
  expect(screen.getByRole("tab", { name: "Whole plan" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  expect(screen.getByText("Assigned and owned plans")).toBeInTheDocument();
  expect(
    screen.queryByRole("tab", { name: "Schedule & history" }),
  ).not.toBeInTheDocument();
});
it("starts on upcoming workouts by default", () => {
  render(
    <MemoryRouter initialEntries={["/app/my-training"]}>
      <TrainingHome />
    </MemoryRouter>,
  );
  expect(screen.getByRole("tab", { name: "Upcoming" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  expect(screen.getByText("No upcoming workouts")).toBeInTheDocument();
});
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);

it("preserves desktop Training tabs and the History URL alias", () => {
  state.mobile = false;
  render(
    <MemoryRouter initialEntries={["/app/my-training?tab=history"]}>
      <TrainingHome />
    </MemoryRouter>,
  );
  expect(screen.getByRole("heading", { name: "Training" })).toBeInTheDocument();
  expect(
    screen.getByRole("tab", { name: "Schedule & history" }),
  ).toHaveAttribute("aria-selected", "true");
});
it("keeps the active status filter reachable when widening the schedule", async () => {
  const tree = (
    <MemoryRouter>
      <TrainingSchedule />
    </MemoryRouter>
  );
  const view = render(tree);
  await userEvent.click(screen.getByRole("button", { name: /Workout status/ }));
  await userEvent.click(screen.getByRole("option", { name: "Completed" }));
  expect(state.filters.status).toBe("Completed");
  state.mobile = false;
  view.rerender(
    <MemoryRouter>
      <TrainingSchedule />
    </MemoryRouter>,
  );
  expect(
    screen.getByRole("button", { name: /Workout status/ }),
  ).toBeInTheDocument();
  expect(state.filters.status).toBe("Completed");
});
it("keeps an assigned plan schedule scoped to its relationship and program", () => {
  render(
    <MemoryRouter
      initialEntries={[
        "/app/my-training?tab=history&relationshipId=client-1&programId=plan-1",
      ]}
    >
      <TrainingHome />
    </MemoryRouter>,
  );
  expect(state.filters).toMatchObject({
    relationshipId: "client-1",
    programId: "plan-1",
    view: "client",
  });
});
it("makes the whole workout row a detail link with program, date and exercise count", () => {
  const item = {
    id: "workout-1",
    name: "Lower body",
    programName: "Strength",
    scheduledDate: "2026-10-12",
    exerciseCount: 4,
    status: "Completed",
    loggedLate: false,
  } as Occurrence;
  render(
    <MemoryRouter>
      <MobileWorkoutRows items={[item]} />
    </MemoryRouter>,
  );
  const link = screen.getByRole("link", {
    name: /Lower body.*Strength.*2026-10-12.*4 exercises/,
  });
  expect(link).toHaveAttribute("href", "/app/my-training/workouts/workout-1");
});

it("restores the History progress view from its URL", () => {
  render(
    <MemoryRouter
      initialEntries={["/app/my-training?tab=history&historyView=progress"]}
    >
      <TrainingHome />
    </MemoryRouter>,
  );
  expect(screen.getByRole("radio", { name: "Progress" })).toBeChecked();
  expect(screen.getByText("Training progress content")).toBeInTheDocument();
});
