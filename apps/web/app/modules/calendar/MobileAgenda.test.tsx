import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { MobileAgenda } from "./MobileAgenda";
import type { CalendarEntry } from "./CalendarViews";

const event = (id: string, start: string, end: string): CalendarEntry => ({ id, title: id, start, end, kind: "Meeting", status: "Accepted" });

it("shows the month in local chronological order and opens the same entry", () => {
  const open = vi.fn();
  const entries = [event("Later", "2026-10-20T09:00:00Z", "2026-10-20T10:00:00Z"), event("Local October", "2026-09-30T23:30:00Z", "2026-10-01T00:00:00Z"), event("Outside", "2026-10-31T23:30:00Z", "2026-11-01T01:00:00Z")];
  render(<MobileAgenda entries={entries} date="2026-10-12" zone="Europe/Warsaw" open={open} />);
  expect(screen.queryByText("Outside")).not.toBeInTheDocument();
  const rows = screen.getAllByRole("button");
  expect(rows[0]).toHaveTextContent("Local October");
  fireEvent.click(rows[0]!);
  expect(open).toHaveBeenCalledWith(entries[1]);
});

it("includes an overlapping all-day event once and excludes exclusive month-end boundaries", () => {
  render(<MobileAgenda date="2026-10-12" zone="UTC" open={vi.fn()} entries={[
    { ...event("Camp", "2026-09-28T00:00:00Z", "2026-10-03T00:00:00Z"), day: "2026-09-28", until: "2026-10-03", kind: "Event" },
    { ...event("Ended", "2026-09-28T00:00:00Z", "2026-10-01T00:00:00Z"), day: "2026-09-28", until: "2026-10-01" },
  ]} />);
  expect(screen.getAllByText("Camp")).toHaveLength(1);
  expect(screen.queryByText("Ended")).not.toBeInTheDocument();
  expect(screen.getByText(/All day/)).toBeInTheDocument();
});

it("shows an actionable empty month state", () => {
  render(<MobileAgenda date="2026-10-12" zone="UTC" open={vi.fn()} entries={[]} />);
  expect(screen.getByText("Nothing planned this month")).toBeInTheDocument();
});
