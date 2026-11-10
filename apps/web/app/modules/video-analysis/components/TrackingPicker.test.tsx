import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { TrackingPicker, type TrackingSelection } from "./TrackingPicker";

function Harness() {
  const [value, setValue] = useState<TrackingSelection | null>(null);
  return (
    <>
      <TrackingPicker src="blob:test" value={value} onChange={setValue} />
      <output data-testid="value">{JSON.stringify(value)}</output>
    </>
  );
}

it("records two distinct original-pixel points at one frozen timestamp and resets when seeking", () => {
  const { container } = render(<Harness />);
  const video = container.querySelector("video")!;
  Object.defineProperties(video, {
    videoWidth: { value: 1920 },
    videoHeight: { value: 1080 },
    currentTime: { value: 2.5, writable: true },
    pause: { value: vi.fn() },
  });
  fireEvent.loadedData(video);
  fireEvent.click(screen.getByRole("button", { name: "Freeze this frame" }));
  const canvas = screen.getByRole("button", {
    name: "Mark tracking points on the frozen frame",
  });
  vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
    left: 10,
    top: 20,
    width: 480,
    height: 270,
  } as DOMRect);
  fireEvent.click(canvas, { clientX: 130, clientY: 155 });
  fireEvent.click(canvas, { clientX: 130, clientY: 155 });
  fireEvent.click(canvas, { clientX: 370, clientY: 155 });
  fireEvent.click(canvas, { clientX: 250, clientY: 155 });
  expect(JSON.parse(screen.getByTestId("value").textContent!)).toEqual({
    timestampSeconds: 2.5,
    videoWidth: 1920,
    videoHeight: 1080,
    points: [
      { x: 480, y: 540 },
      { x: 1440, y: 540 },
    ],
  });
  fireEvent.click(screen.getByRole("button", { name: "Undo point" }));
  expect(
    JSON.parse(screen.getByTestId("value").textContent!).points,
  ).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "Clear points" }));
  expect(
    JSON.parse(screen.getByTestId("value").textContent!).points,
  ).toHaveLength(0);
  fireEvent.seeking(video);
  expect(screen.getByTestId("value")).toHaveTextContent("null");
  expect(
    screen.queryByRole("button", {
      name: "Mark tracking points on the frozen frame",
    }),
  ).not.toBeInTheDocument();
});

it("clears markers when choosing another frame and supports keyboard point placement", () => {
  const { container } = render(<Harness />);
  const video = container.querySelector("video")!;
  Object.defineProperties(video, {
    videoWidth: { value: 640 },
    videoHeight: { value: 480 },
    pause: { value: vi.fn() },
  });
  fireEvent.loadedData(video);
  fireEvent.click(screen.getByRole("button", { name: "Freeze this frame" }));
  const canvas = screen.getByRole("button", {
    name: "Mark tracking points on the frozen frame",
  });
  fireEvent.keyDown(canvas, { key: "Enter" });
  fireEvent.keyDown(canvas, { key: "ArrowRight" });
  fireEvent.keyDown(canvas, { key: "Enter" });
  expect(JSON.parse(screen.getByTestId("value").textContent!).points).toEqual([
    { x: 320, y: 240 },
    { x: 326, y: 240 },
  ]);
  fireEvent.click(screen.getAllByRole("button", { name: "Cancel" })[0]!);
  expect(screen.getByTestId("value")).toHaveTextContent("null");
});
