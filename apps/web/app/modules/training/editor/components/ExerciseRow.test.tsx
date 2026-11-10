import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import type { TrainingDocument } from "@metrivum/api-client-web";
import { ExerciseRow } from "./ExerciseCells";
import { findWorkout } from "../model/document";
vi.mock("../../queries", () => ({
  useBuiltInFormulas: () => ({ data: [] }),
  useFormulaList: () => ({ data: { items: [] } }),
}));
vi.mock("~/shared/session/AccountScope", () => ({
  useAccountContext: () => ({ lifecycle: { isCurrent: () => true } }),
  useApi: () => vi.fn(),
  useAccountKey: () => "test",
}));
function Harness() {
  const [doc, setDoc] = useState<TrainingDocument>({
    schemaVersion: 1,
    blocks: [
      {
        id: "b",
        name: "Block",
        description: "",
        cycles: [
          {
            id: "c",
            name: "Cycle",
            description: "",
            dayCount: 7,
            days: [
              {
                id: "d",
                dayNumber: 1,
                workouts: [
                  {
                    id: "w",
                    name: "Workout",
                    description: "",
                    groups: [],
                    exercises: [
                      {
                        id: "e",
                        exerciseId: "bench",
                        comment: "",
                        sets: [
                          {
                            id: "s",
                            kind: "Standard",
                            prescription: { reps: { minimum: 5, maximum: 5 } },
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  });
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { enabled: false } } }),
  );
  const workout = findWorkout(doc, "w")!;
  return (
    <QueryClientProvider client={client}>
      <ExerciseRow
        instance={workout.exercises[0]!}
        workout={workout}
        names={new Map()}
        name="Bench"
        cells={{
          exercise: {},
          sets: {},
          reps: {},
          load: {},
          time: {},
          rest: {},
          comment: {},
        }}
        readOnly={false}
        apply={setDoc}
      />
      <output aria-label="document">
        {JSON.stringify(workout.exercises[0])}
      </output>
    </QueryClientProvider>
  );
}
const saved = () => JSON.parse(screen.getByLabelText("document").textContent!);
it("saves and closes the comment on Enter, but inserts a newline with Ctrl+Enter", () => {
  render(<Harness />);
  fireEvent.click(screen.getByRole("button", { name: /Comment:/ }));
  const input = screen.getByRole("textbox", { name: "Comment" });
  expect(input).toHaveFocus();
  fireEvent.change(input, { target: { value: "First" } });
  fireEvent.keyDown(input, { key: "Enter", ctrlKey: true });
  expect(input).toHaveValue("First\n");
  expect(saved().comment).toBe("First\n");
  fireEvent.keyDown(input, { key: "Enter", isComposing: true });
  expect(input).toBeInTheDocument();
  fireEvent.keyDown(input, { key: "Enter" });
  expect(
    screen.queryByRole("textbox", { name: "Comment" }),
  ).not.toBeInTheDocument();
  expect(saved().comment).toBe("First\n");
});
it("persists AMRAP and MAX, and replaces them with numeric targets", () => {
  render(<Harness />);
  const input = screen.getByRole("combobox", { name: "Reps" });
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: "AMRAP" } });
  fireEvent.keyDown(input, { key: "Enter" });
  expect(saved().sets[0].kind).toBe("Amrap");
  expect(saved().sets[0].prescription.reps).toBeUndefined();
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: "8" } });
  fireEvent.keyDown(input, { key: "Enter" });
  expect(saved().sets[0].kind).toBe("Standard");
  expect(saved().sets[0].prescription.reps.minimum).toBe(8);
  fireEvent.keyDown(screen.getByRole("gridcell", { name: /Time:/ }), {
    key: "/",
  });
  fireEvent.click(screen.getByRole("option", { name: "MAX" }));
  expect(saved().sets[0].prescription.workTimeMax).toBe(true);
  expect(saved().sets[0].prescription.workTime == null).toBe(true);
  const time = screen.getByRole("combobox", { name: "Time" });
  fireEvent.focus(time);
  fireEvent.change(time, { target: { value: "30" } });
  fireEvent.keyDown(time, { key: "Enter" });
  expect(saved().sets[0].prescription.workTimeMax == null).toBe(true);
  expect(saved().sets[0].prescription.workTime.value).toBe(30);
});

it("focuses the note immediately on every opening", () => {
  render(<Harness />);
  const trigger = screen.getByRole("button", { name: /Comment:/ });
  fireEvent.click(trigger);
  expect(screen.getByRole("textbox", { name: "Comment" })).toHaveFocus();
  fireEvent.keyDown(screen.getByRole("textbox", { name: "Comment" }), {
    key: "Escape",
  });
  fireEvent.click(trigger);
  expect(screen.getByRole("textbox", { name: "Comment" })).toHaveFocus();
});
