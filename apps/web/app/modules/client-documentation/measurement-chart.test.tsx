import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { MeasurementChart } from "./measurement-chart";

it("positions measurements by elapsed time rather than record index", () => {
  const { container } = render(<MeasurementChart unit="kg" points={[
    { observedAt: "2026-01-01", value: 80 },
    { observedAt: "2026-01-02", value: 79 },
    { observedAt: "2026-01-11", value: 78 },
  ]} />);
  const x = [...container.querySelectorAll("circle")].map((c) => Number(c.getAttribute("cx")));
  // One day out of ten between the first two readings: a tenth of the plotted width, not a half.
  expect((x[1]! - x[0]!) / (x[2]! - x[0]!)).toBeCloseTo(0.1, 5);
  expect(screen.getByRole("img", { name: "Measurement history (kg)" })).toBeInTheDocument();
});

it("renders a single observed value and an honest empty state", () => {
  const { container, rerender } = render(<MeasurementChart unit="%" points={[{ observedAt: "2026-01-01", value: 20 }]} />);
  // A single reading sits in the middle of the plot, horizontally and vertically.
  const lines = [...container.querySelectorAll("line")].map((l) => Number(l.getAttribute("y1")));
  const dot = container.querySelector("circle")!;
  expect(Number(dot.getAttribute("cx"))).toBeCloseTo((48 + 624) / 2, 5);
  expect(Number(dot.getAttribute("cy"))).toBeCloseTo((Math.min(...lines) + Math.max(...lines)) / 2, 5);
  rerender(<MeasurementChart unit="%" points={[]} />);
  expect(screen.getByText("No measurements in this period.")).toBeInTheDocument();
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
});
