import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { WorkoutFeedbackForm } from "./WorkoutReview";

const mutate = vi.hoisted(() => vi.fn());
vi.mock("~/modules/coaching", () => ({ useCoachingMutation: () => ({ mutate, isPending: false, error: null }), MutationError: () => null }));
beforeEach(() => mutate.mockClear());

it("can be skipped without changing the completed execution", async () => {
  render(<WorkoutFeedbackForm own execution={{ id: "done", version: 3, status: "Completed" }} />);
  await userEvent.click(screen.getByRole("button", { name: "Later" }));
  expect(mutate).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Add or edit feedback" })).toBeInTheDocument();
});

it("sends all selected scales with the current execution version", async () => {
  render(<WorkoutFeedbackForm own execution={{ id: "done", version: 3, status: "Completed" }} />);
  for (const button of screen.getAllByRole("button", { name: "4" })) await userEvent.click(button);
  const input = screen.getByRole("textbox", { name: "Whole session difficulty (Session RPE)" });
  await userEvent.type(input, "0");
  await userEvent.tab();
  await userEvent.click(screen.getByRole("button", { name: "Save feedback" }));
  expect(mutate).toHaveBeenCalledWith(expect.objectContaining({ method: "PUT", path: "/api/v1/training/executions/done/feedback", ifMatch: 3, json: expect.objectContaining({ rating: 4, wellbeing: 4, sleepQuality: 4, sessionRpe: 0 }) }));
});

it("shows saved feedback to the coach without exposing an edit action", () => {
  render(<WorkoutFeedbackForm own={false} execution={{ id: "done", version: 3, status: "Completed", feedback: { rating: 4, sessionRpe: 7, wellbeing: 3, sleepQuality: 2, note: "Tired" } }} />);
  expect(screen.getByText("Tired")).toBeInTheDocument();
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});
