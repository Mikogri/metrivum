import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { AnalysisResult, TrajectoryPoint } from "@trainflow/api-client-web";
import { expect, it, vi } from "vitest";
import { ResultView } from "./ResultView";
import { BarPathPlot, TimeSeriesChart } from "./charts";

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

it("uses analyzer rep metrics, selects the reported phase and filters its velocity chart", () => {
  render(<QueryClientProvider client={new QueryClient()}><ResultView result={result} /></QueryClientProvider>);
  expect(screen.getByRole("table")).toHaveTextContent("120 px/s");
  expect(screen.getByRole("table")).toHaveTextContent("250 px/s");
  fireEvent.click(screen.getByRole("radio", { name: /1/ }));
  fireEvent.click(screen.getByRole("radio", { name: "Lifting" }));
  expect(screen.getByRole("img", { name: /Lifting.*px\/s/ })).toBeInTheDocument();
  expect(screen.getByRole("img", { name: /Lifting.*px\/s/ }).querySelector("path")?.getAttribute("d")?.match(/L/g)).toHaveLength(2);
  expect(screen.getByText("Mean speed").nextElementSibling).toHaveTextContent("120 px/s");
  fireEvent.click(screen.getByRole("radio", { name: "Pause" }));
  expect(screen.getByText("Mean speed").nextElementSibling).toHaveTextContent("2 px/s");
  expect(screen.getByRole("img", { name: /Pause.*px\/s/ })).toBeInTheDocument();
});

it("seeks the authorized video preview when selecting a phase", async () => {
  const { container } = render(<QueryClientProvider client={new QueryClient()}><ResultView result={result} mediaId="video-1" /></QueryClientProvider>);
  fireEvent.click(screen.getByRole("button", { name: /Load video/ }));
  await waitFor(() => expect(container.querySelector("video")).toBeInTheDocument());
  fireEvent.click(screen.getByRole("radio", { name: /1/ }));
  fireEvent.click(screen.getByRole("radio", { name: "Lifting" }));
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
  const { container } = render(<><TimeSeriesChart points={points} value={(p) => p.velocity ?? null} unit="px/s" label="Speed" timeLabel="Time" locale="en" /><BarPathPlot points={points} unit="px" label="Path" /></>);
  const charts = container.querySelectorAll("svg");
  expect(charts[0]!.querySelectorAll("path")).toHaveLength(3);
  expect(charts[1]!.querySelectorAll("path")).toHaveLength(3);
});
