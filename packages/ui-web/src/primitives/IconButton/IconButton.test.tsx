import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { IconButton } from "./IconButton";

it("shows progress and blocks repeated presses while pending", async () => {
  const onPress = vi.fn();
  const { rerender } = render(
    <IconButton
      label="Mark read"
      icon={<span>Check</span>}
      isPending
      onPress={onPress}
      showTooltip={false}
    />,
  );
  expect(
    screen.getByRole("button", { name: "Mark read" }).querySelector("svg"),
  ).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Mark read" }));
  expect(onPress).not.toHaveBeenCalled();
  rerender(
    <IconButton
      label="Mark read"
      icon={<span>Check</span>}
      onPress={onPress}
      showTooltip={false}
    />,
  );
  expect(screen.getByText("Check")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Mark read" }));
  expect(onPress).toHaveBeenCalledOnce();
});
