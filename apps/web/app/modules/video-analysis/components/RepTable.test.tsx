import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { RepTable, type RepRowData } from "./RepTable";

const row: RepRowData = {
  id: "rep-3",
  rep: { number: 3, startSeconds: 0, endSeconds: 1, phases: [] },
  checked: true,
  speedUnit: "px/s",
};

it("keeps old results unreviewed and shows persisted status without editing shared results", () => {
  render(
    <RepTable
      label="Shared result"
      locale="en"
      rows={[
        row,
        {
          ...row,
          id: "rep-4",
          rep: { ...row.rep, number: 4, performed: false },
        },
      ]}
    />,
  );
  expect(screen.getByText("Not reviewed")).toBeInTheDocument();
  expect(screen.getByText("Not performed")).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: /Completion of rep/ }),
  ).not.toBeInTheDocument();
});

it("lets the owner explicitly review a detected repetition", async () => {
  const review = vi.fn(),
    user = userEvent.setup();
  render(
    <RepTable
      label="Owned result"
      locale="en"
      rows={[{ ...row, onReview: review }]}
    />,
  );
  await user.click(screen.getByRole("button", { name: /Completion of rep 3/ }));
  await user.click(screen.getByRole("option", { name: "Not performed" }));
  expect(review).toHaveBeenCalledWith(false);
});
