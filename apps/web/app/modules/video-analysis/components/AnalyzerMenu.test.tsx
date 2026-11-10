import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, expect, it, vi } from "vitest";
import { AnalyzerMenu } from "./AnalyzerMenu";

const state = vi.hoisted(() => ({
  value: {} as Record<string, unknown>,
  markSeen: vi.fn(),
}));
vi.mock("~/shared/access", () => ({
  useFeatureAccess: () => ({ allowed: true }),
}));
vi.mock("../analyzer-jobs", () => ({ useAnalyzerJobs: () => state.value }));
vi.mock("../queries", () => ({
  useAnalysisList: () => ({
    isPending: false,
    data: [
      {
        id: "old-1",
        name: "Last week squat",
        createdAt: "2026-10-14T10:00:00Z",
        completedAt: "2026-10-14T10:05:00Z",
      },
    ],
  }),
}));

const job = (id: string, name: string, extra: Record<string, unknown>) => ({
  id,
  name,
  fileName: `${id}.mov`,
  size: 1,
  state: "queued",
  progress: 0,
  position: null,
  createdAt: "",
  startedAt: null,
  finishedAt: null,
  error: null,
  mediaId: null,
  sourceVideo: { durationSeconds: 1, width: 1, height: 1 },
  configuration: {
    movement: "squat",
    tracking: {
      timestampSeconds: 0,
      videoWidth: 1,
      videoHeight: 1,
      points: [],
    },
  },
  ...extra,
});

beforeEach(() => {
  state.markSeen.mockReset();
  state.value = {
    jobs: [],
    saved: [],
    saving: {},
    saveErrors: {},
    reachable: null,
    unseen: 0,
    markSeen: state.markSeen,
  };
});
const mount = () =>
  render(
    <MemoryRouter>
      <AnalyzerMenu />
    </MemoryRouter>,
  );

it("is always in the app bar and shows the latest analyses when nothing is queued", () => {
  mount();
  fireEvent.click(screen.getByRole("button", { name: "Video analyses" }));
  expect(screen.getByText("Latest analyses")).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: /Last week squat/ }),
  ).toBeInTheDocument();
});

it("shows a failed video with a short label and its reason on hover", () => {
  state.value = {
    ...state.value,
    reachable: true,
    jobs: [
      job("f", "Heavy single", {
        state: "failed",
        error: "The bar was not visible.",
      }),
    ],
  };
  mount();
  fireEvent.click(screen.getByRole("button", { name: "Video analyses" }));
  expect(
    screen.getByRole("button", { name: "Failed · details" }),
  ).toBeInTheDocument();
  expect(screen.queryByText("The bar was not visible.")).toBeNull();
});

it("shows how many videos are in progress and lists them with their progress", () => {
  state.value = {
    ...state.value,
    reachable: true,
    jobs: [
      job("a", "Front squat", { state: "analyzing", progress: 0.5 }),
      job("b", "Bench", { position: 1 }),
    ],
    saved: [
      { id: "c", name: "Deadlift", analysisId: "analysis-c", savedAt: 1 },
    ],
  };
  mount();
  fireEvent.click(
    screen.getByRole("button", { name: "Video analyses: 2 in progress" }),
  );
  expect(state.markSeen).toHaveBeenCalled();
  expect(
    screen.getByRole("progressbar", { name: "Front squat progress" }),
  ).toHaveAttribute("aria-valuenow", "44");
  expect(screen.getByText("44%")).toBeInTheDocument();
  expect(screen.getByText("Next in line")).toBeInTheDocument();
  expect(screen.getByText("Deadlift")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Open" })).toBeInTheDocument();
});
