import type * as CoachingModule from "~/modules/coaching";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { TrainingPlansTab } from "./TrainingPlans";
const state = vi.hoisted(() => ({
  planId: null as string | null,
  paths: [] as string[],
}));
vi.mock("~/modules/coaching", async (importOriginal) => ({
  ...(await importOriginal<typeof CoachingModule>()),
  useCoachingQuery: (path: string) => {
    state.paths.push(path);
    return {
      isPending: false,
      isError: false,
      data: {
        items: [
          {
            orderId: "order",
            applicationId: "application",
            name: "Strength plan",
            planId: state.planId,
            createdAt: "2026-10-10",
            deliveredAt: state.planId ? "2026-10-10" : null,
          },
        ],
        page: 1,
        pageSize: 20,
        total: 1,
      },
    };
  },
  useCoachingMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("../delivery/Assignments", () => ({
  AssignmentList: () => <div>Assigned plan list</div>,
}));
beforeEach(() => {
  state.planId = null;
  state.paths = [];
});
it("keeps unpaid content locked and does not fetch a plan snapshot", () => {
  render(<TrainingPlansTab />);
  expect(
    screen.getByText("Content stays locked until the payment is complete"),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Pay to unlock" }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("link", { name: "Open plan" }),
  ).not.toBeInTheDocument();
  expect(
    state.paths.every((path) => path === "/api/v1/training/purchases"),
  ).toBe(true);
});
it("links delivered copies to the client workspace and filters assigned plans", async () => {
  state.planId = "owned-copy";
  render(<TrainingPlansTab />);
  expect(screen.getByRole("link", { name: "Open plan" })).toHaveAttribute(
    "href",
    "/app/training-plans/owned-copy",
  );
  await userEvent.click(screen.getByRole("radio", { name: "Purchased" }));
  expect(screen.queryByText("Assigned plan list")).not.toBeInTheDocument();
});
