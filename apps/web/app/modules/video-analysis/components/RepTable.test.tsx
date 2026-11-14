import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { RepTable, type RepRowData } from "./RepTable";

const row: RepRowData = {
  id: "rep-3",
  rep: { number: 3, startSeconds: 0, endSeconds: 1, phases: [] },
  checked: true,
  speedUnit: "px/s",
};

it("does not show or edit rep completion in the table: that is changed in Edit", () => {
  render(
    <RepTable
      label="Result"
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
  expect(screen.queryByText("Not reviewed")).not.toBeInTheDocument();
  expect(screen.queryByText("Not performed")).not.toBeInTheDocument();
  expect(
    screen.queryByRole("columnheader", { name: "Completion" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: /Completion of rep/ }),
  ).not.toBeInTheDocument();
});
