import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, expect, it, vi } from "vitest";
import AssignedPlan from "./AssignedPlan";

const state = vi.hoisted(() => ({ status: "Active" }));
vi.mock("~/modules/coaching", () => ({
  useCoachingQuery: () => ({
    isPending: false,
    isError: false,
    data: {
      name: "Strength plan",
      description: "Full plan description",
      status: state.status,
      coachDisplayName: "Coach Example",
      coachUsername: "coach",
      exercises: {},
      document: {},
    },
  }),
  Loading: () => null,
  Failure: () => null,
}));
vi.mock("../editor/components/WeekView", () => ({
  WeekView: () => <div>Plan content</div>,
}));
beforeEach(() => {
  state.status = "Active";
});

it("shows the assigned coach and opens the full description using the shared preview", async () => {
  render(
    <MemoryRouter>
      <AssignedPlan />
    </MemoryRouter>,
  );
  expect(screen.getByText("Active")).toBeInTheDocument();
  expect(screen.getByText(/Assigned by Coach Example/)).toHaveTextContent(
    "(@coach)",
  );
  const preview = screen.getByRole("button", { name: "Full plan description" });
  expect(preview.className).toContain("descriptionPreview");
  await userEvent.click(preview);
  expect(screen.getAllByText("Full plan description")).toHaveLength(2);
});

it.each(["Paused", "Completed", "Cancelled"])(
  "shows %s instead of an active status",
  (status) => {
    state.status = status;
    render(
      <MemoryRouter>
        <AssignedPlan />
      </MemoryRouter>,
    );
    expect(screen.getByText(status)).toBeInTheDocument();
    expect(screen.queryByText("Active")).not.toBeInTheDocument();
  },
);
