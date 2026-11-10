import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it } from "vitest";
import { PlanDescription } from "./PlanDescription";

it("opens full text by click and supports closing with Escape", async () => {
  render(
    <PlanDescription text="Full plan description" title="Strength plan" />,
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Full plan description" }),
  );
  expect(screen.getAllByText("Full plan description")).toHaveLength(2);
  await userEvent.keyboard("{Escape}");
  expect(screen.getAllByText("Full plan description")).toHaveLength(1);
});
it("opens full text using the context menu", () => {
  render(<PlanDescription text="Long description" title="Plan" />);
  fireEvent.contextMenu(
    screen.getByRole("button", { name: "Long description" }),
    { clientX: 20, clientY: 40 },
  );
  expect(screen.getAllByText("Long description")).toHaveLength(2);
});
