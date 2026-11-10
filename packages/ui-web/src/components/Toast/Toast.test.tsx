import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Toaster, toast } from "./Toast";

afterEach(() => {
  vi.useRealTimers();
});

describe("Toast", () => {
  it("announces only the latest result, replacing the previous message", () => {
    render(<Toaster label="Notifications" dismissLabel="Dismiss" />);
    act(() => {
      toast({ title: "Saved", tone: "success" });
    });
    expect(screen.getByRole("status")).toHaveTextContent("Saved");
    act(() => {
      toast({ title: "Couldn't save", tone: "danger" });
    });
    expect(screen.queryByText("Saved")).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't save");
  });

  it("keeps errors until dismissed and lets a new success expire independently", () => {
    vi.useFakeTimers();
    render(<Toaster label="Notifications" dismissLabel="Dismiss" />);
    act(() => {
      toast({ title: "Check the price", tone: "danger" });
    });
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(screen.getByRole("alert")).toHaveTextContent("Check the price");
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    act(() => {
      vi.advanceTimersByTime(220);
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    act(() => {
      toast({ title: "Published", tone: "success" });
    });
    act(() => {
      vi.advanceTimersByTime(6_000);
    });
    act(() => {
      vi.advanceTimersByTime(220);
    });
    expect(screen.queryByText("Published")).not.toBeInTheDocument();
  });
});
