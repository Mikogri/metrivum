import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it } from "vitest";
import type { TrainingDocument, Workout } from "@trainflow/api-client-web";
import type { ExerciseLabel } from "~/modules/exercises";
import { findWorkout } from "../model/document";
import { ExerciseTools } from "./ExerciseTools";

const workout: Workout = { id: "workout", name: "Training", description: "", groups: [], exercises: [
  { id: "a", exerciseId: "bench", comment: "", sets: [{ id: "set", kind: "Standard", prescription: { reps: { minimum: 5, maximum: 5 } } }] },
  { id: "b", exerciseId: "row", comment: "", sets: [] },
] };
const names = new Map([["bench", { name: "Bench press" } as ExerciseLabel], ["row", { name: "Row" } as ExerciseLabel]]);
function Harness() {
  const [doc, setDoc] = useState<TrainingDocument>({ schemaVersion: 1, blocks: [{ id: "block", name: "Block", description: "", cycles: [{ id: "cycle", name: "Cycle", description: "", dayCount: 7, days: [{ id: "day", dayNumber: 1, workouts: [workout] }] }] }] });
  const current = findWorkout(doc, "workout")!;
  return <><ExerciseTools workout={current} instance={current.exercises[0]!} names={names} apply={setDoc} advancedAllowed={false} style={{}} /><output aria-label="document">{JSON.stringify(current)}</output></>;
}
const value = () => JSON.parse(screen.getByLabelText("document").textContent!) as Workout;

it("creates and unlinks a superset using the same controls in either editor mode", async () => {
  const user = userEvent.setup(); render(<Harness />);
  await user.click(screen.getByRole("button", { name: "Supersets and set types: Bench press" }));
  await user.click(screen.getByRole("radio", { name: "Super Set" }));
  await user.click(screen.getByRole("button", { name: "Create superset" }));
  expect(value().groups[0]?.exerciseIds).toEqual(["a", "b"]);
  expect(screen.getByText("Super Set 1")).toBeInTheDocument();
  expect(screen.getByText("Bench press + Row")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Unlink exercises" }));
  expect(value().groups).toEqual([]);
});

it.each(["Warm-up", "Back-off"])("marks an individual set as %s without changing its prescription", async label => {
  const user = userEvent.setup(); render(<Harness />);
  await user.click(screen.getByRole("button", { name: "Supersets and set types: Bench press" }));
  await user.click(screen.getByRole("button", { name: /Set 1/ }));
  await user.click(screen.getByRole("option", { name: label }));
  expect(value().exercises[0]?.sets[0]?.kind).toBe(label === "Warm-up" ? "Warmup" : "BackOff");
  expect(value().exercises[0]?.sets[0]?.prescription.reps).toEqual({ minimum: 5, maximum: 5 });
});

it("applies a set type to every set from the type list", async () => {
  const user = userEvent.setup(); render(<Harness />);
  await user.click(screen.getByRole("button", { name: "Supersets and set types: Bench press" }));
  await user.click(screen.getByRole("button", { name: "Warm-up" }));
  expect(value().exercises[0]?.sets.every(set => set.kind === "Warmup")).toBe(true);
});
