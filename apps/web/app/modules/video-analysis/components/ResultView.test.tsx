import userEvent from "@testing-library/user-event";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { AnalysisResult, TrajectoryPoint } from "@trainflow/api-client-web";
import { expect, it, vi } from "vitest";
import { ResultView } from "./ResultView";
import { OverlayChart, pathRuns, timeSeries, movementSpeed } from "./charts";

vi.mock("~/shared/session/AccountScope", () => ({ useApi: () => vi.fn() }));
vi.mock("../api", () => ({ readUrl: async () => ({ url: "https://example.test/signed-video", expiresAt: "2099-01-01" }) }));

const result: AnalysisResult = {
  schemaVersion: 2, engineVersion: "test", modelVersion: "test", method: "tracking", positionUnit: "px", metersPerPixel: null, warnings: [],
  repetitions: [{ number: 1, startSeconds: 0, endSeconds: 3, meanSpeed: 120, peakSpeed: 250, phases: [
    { kind: "lowering", startSeconds: 0, endSeconds: 1, meanSpeed: 40, peakSpeed: 70 },
    { kind: "pause", startSeconds: 1, endSeconds: 2, meanSpeed: 2, peakSpeed: 4 },
    { kind: "lifting", startSeconds: 2, endSeconds: 3, meanSpeed: 120, peakSpeed: 250 },
  ] }],
  trajectory: [0, 0.5, 1, 1.5, 2, 2.5, 3].map((seconds) => ({ seconds, x: 20, y: seconds * 10, velocity: 7, quality: 1, occluded: false, segment: 0 })),
};

it("uses analyzer rep metrics and shows one phase's own numbers when only that phase is shown", () => {
  render(<QueryClientProvider client={new QueryClient()}><ResultView result={result} /></QueryClientProvider>);
  expect(screen.getByRole("table")).toHaveTextContent("120 px/s");
  expect(screen.getByRole("table")).toHaveTextContent("250 px/s");
  fireEvent.click(within(screen.getByRole("group", { name: "Show phases" })).getByRole("button", { name: "Lowering" }));
  fireEvent.click(within(screen.getByRole("group", { name: "Show phases" })).getByRole("button", { name: "Pause" }));
  expect(screen.getByRole("img", { name: /Lifting.*px\/s/ })).toBeInTheDocument();
  expect(screen.getAllByText("Mean speed").find((node) => node.tagName === "DT")!.nextElementSibling).toHaveTextContent("120 px/s");
});

it("shows only the repetitions ticked in the table and keeps at least one", () => {
  const three = { ...result, repetitions: [0, 3, 6].map((start, i) => ({ ...result.repetitions[0]!, number: i + 1, startSeconds: start, endSeconds: start + 3,
    phases: result.repetitions[0]!.phases.map((p) => ({ ...p, startSeconds: p.startSeconds + start, endSeconds: p.endSeconds + start })) })),
    trajectory: Array.from({ length: 19 }, (_, i) => ({ seconds: i * 0.5, x: 20, y: i, velocity: 7, quality: 1, occluded: false, segment: 0 })) };
  render(<QueryClientProvider client={new QueryClient()}><ResultView result={three} /></QueryClientProvider>);
  expect(screen.getByRole("button", { name: /Repetitions: All repetitions/ })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("checkbox", { name: "Hide rep 2" }));
  expect(screen.getByRole("button", { name: "Repetitions: Repetitions: 1, 3" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("checkbox", { name: "Hide rep 3" }));
  // The last ticked rep cannot be unticked.
  expect(screen.getByRole("checkbox", { name: "Hide rep 1" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Repetitions: Rep 1" })).toBeInTheDocument();
});

it("colours speeds from red to green and sorts the table by a column", () => {
  const reps = [1, 2, 3].map((n) => ({ ...result.repetitions[0]!, number: n, startSeconds: (n - 1) * 3, endSeconds: (n - 1) * 3 + 2 + n * 0.2, meanSpeed: 100 * n, peakSpeed: 200 * n }));
  render(<QueryClientProvider client={new QueryClient()}><ResultView result={{ ...result, repetitions: reps }} /></QueryClientProvider>);
  const fastest = screen.getByText("300 px/s");
  expect(fastest).toHaveStyle({ color: "rgb(109, 255, 170)" });
  expect(screen.getByText("100 px/s")).toHaveStyle({ color: "rgb(239, 83, 80)" });
  fireEvent.click(screen.getByRole("button", { name: /Mean speed/ }));
  const firstRow = screen.getAllByRole("row")[1]!;
  expect(firstRow).toHaveTextContent("Rep 3");
  expect(screen.getAllByRole("columnheader").some((cell) => cell.textContent?.includes("Lifting"))).toBe(true);
});

it("puts the analyzer's warnings and the calibration note behind one warning icon", () => {
  render(<QueryClientProvider client={new QueryClient()}><ResultView result={{ ...result, warnings: ["Bar left the frame"] }} /></QueryClientProvider>);
  expect(screen.getByRole("button", { name: "Analyzer warnings: 2" })).toBeInTheDocument();
  expect(screen.queryByText("Bar left the frame")).not.toBeInTheDocument();
});

it("seeks the authorized video from the phase timeline", async () => {
  const { container } = render(<QueryClientProvider client={new QueryClient()}><ResultView result={result} mediaId="video-1" /></QueryClientProvider>);
  fireEvent.click(screen.getByRole("button", { name: /Load video/ }));
  await waitFor(() => expect(container.querySelector("video")).toBeInTheDocument());
  fireEvent.click(screen.getByRole("button", { name: "Rep 1 · Lifting" }));
  expect(container.querySelector("video")!.currentTime).toBe(2);
});

it("does not infer legacy aggregate metrics from sampled velocity", () => {
  render(<QueryClientProvider client={new QueryClient()}><ResultView result={{ ...result, repetitions: [{ ...result.repetitions[0]!, meanSpeed: null, peakSpeed: null }] }} /></QueryClientProvider>);
  expect(screen.getByRole("table")).toHaveTextContent("—");
  expect(screen.getByText("The analyzer did not report speed metrics.")).toBeInTheDocument();
  expect(screen.getByRole("table")).not.toHaveTextContent("7.00");
});

it("breaks both charts at segment boundaries and occlusion", () => {
  const points: TrajectoryPoint[] = result.trajectory.map((p, i) => ({ ...p, segment: i < 2 ? 0 : 1, occluded: i === 4 }));
  // Time chart: a gap between the two segments and at the hidden sample.
  const series = timeSeries(points, (p) => p.velocity ?? null);
  expect(series.y.filter((v) => v === null)).toHaveLength(2);
  expect(series.x).toEqual([...series.x].sort((a, b) => a - b));
  // Bar path: separate pieces per segment, per hidden stretch and per phase.
  const runs = pathRuns(points, result.repetitions);
  expect(runs.map((run) => run.kind)).toEqual(["eccentric", "eccentric", "pause", "concentric"]);
  expect(runs.flatMap((run) => run.points).some((p) => p.occluded)).toBe(false);
});

it("displays speed magnitudes without filling missing samples or mutating analyzer data", () => {
  const raw = [-12, 0, 8, null, -3];
  const points = raw.map((velocity, i) => ({ ...result.trajectory[0]!, seconds: i, velocity }));
  expect(timeSeries(points, movementSpeed).y).toEqual([12, 0, 8, null, 3]);
  expect(points.map(p => p.velocity)).toEqual(raw);
});

it("explains a chart through its information button", async () => {
  render(<OverlayChart lines={[]} label="Bar height" unit="px" locale="en" description="Height relative to lifting onset." />);
  const button = screen.getByRole("button", { name: "About Bar height" });
  await userEvent.setup().tab();
  expect(button).toHaveFocus();
  await waitFor(() => expect(screen.getByRole("tooltip")).toHaveTextContent("Height relative to lifting onset."));
});
