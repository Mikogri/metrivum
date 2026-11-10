import type { ReactNode } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router";
import { expect, it, vi } from "vitest";
import ExercisesRoute from "./exercises";

vi.mock("~/modules/anatomy", () => ({
  MuscleExplorer: ({
    children,
    muscleKey,
    onMuscleChange,
  }: {
    children: ReactNode;
    muscleKey: string;
    onMuscleChange: (key: string) => void;
  }) => (
    <>
      <button onClick={() => onMuscleChange(muscleKey ? "" : "quadriceps")}>
        Pick muscle
      </button>
      {children}
    </>
  ),
}));
vi.mock("~/shared/access", () => ({
  useFeatureAccess: () => ({ allowed: true }),
  FeatureGate: ({ children }: { children: ReactNode }) => children,
  RequireFeature: ({ children }: { children: ReactNode }) => children,
  LockedReason: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("../components/CreateExerciseDialog", () => ({
  CreateExerciseDialog: () => null,
}));
vi.mock("../components/FavoriteButton", () => ({
  FavoriteButton: () => <button>Favorite exercise</button>,
}));
vi.mock("../queries", () => ({
  useExerciseList: () => ({
    data: {
      total: 42,
      items: [
        {
          id: "squat",
          name: "Squat",
          description: "Barbell squat",
          primaryMuscleKeys: ["quads"],
          createdAt: "2026-10-01T10:00:00Z",
          isFavorite: false,
        },
      ],
    },
  }),
  useDictionaries: () => ({ data: { muscles: [], movementPatterns: [] } }),
  useTags: () => ({ data: [] }),
}));
function Location() {
  return <output data-testid="url">{useLocation().search}</output>;
}

it("switches views without losing filters or page and preserves the card view when clearing filters", () => {
  render(
    <MemoryRouter
      initialEntries={["/app/exercises?q=Squat&page=2&sort=newest"]}
    >
      <ExercisesRoute />
      <Location />
    </MemoryRouter>,
  );
  expect(screen.getByRole("table")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("radio", { name: "Cards" }));
  expect(screen.queryByRole("table")).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Squat" })).toHaveAttribute(
    "href",
    "/app/exercises/squat",
  );
  expect(
    screen.getByRole("button", { name: "Favorite exercise" }),
  ).toBeInTheDocument();
  expect(screen.getByTestId("url")).toHaveTextContent(
    "q=Squat&page=2&sort=newest&view=cards",
  );
  fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
  expect(screen.getByTestId("url")).toHaveTextContent(
    "?sort=newest&view=cards",
  );
});

it("uses the shared URL muscle filter for model selection and resets pagination", () => {
  render(
    <MemoryRouter initialEntries={["/app/exercises?page=3&sort=newest"]}>
      <ExercisesRoute />
      <Location />
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Pick muscle" }));
  expect(screen.getByTestId("url")).toHaveTextContent(
    "?sort=newest&muscle=quadriceps",
  );
  fireEvent.click(screen.getByRole("button", { name: "Pick muscle" }));
  expect(screen.getByTestId("url")).toHaveTextContent("?sort=newest");
});
