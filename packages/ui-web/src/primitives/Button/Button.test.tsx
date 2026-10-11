import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Button } from "./Button";

describe("Button", () => {
  it("renders a spinner for the shared pending prop", () => {
    render(<Button isPending>Save</Button>);
    expect(screen.getByRole("button", { name: "Save" }).querySelector("svg")).toBeInTheDocument();
  });
  it("fires onPress and is keyboard operable", async () => {
    const onPress = vi.fn();
    render(<Button onPress={onPress}>Save</Button>);
    await userEvent.tab();
    expect(screen.getByRole("button", { name: "Save" })).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    expect(onPress).toHaveBeenCalledOnce();
  });

  it("blocks presses while loading and keeps its accessible name", async () => {
    const onPress = vi.fn();
    render(
      <Button onPress={onPress} loading>
        Publish
      </Button>,
    );
    const button = screen.getByRole("button", { name: /Publish/ });
    await userEvent.click(button);
    expect(onPress).not.toHaveBeenCalled();
  });

  it("does not fire when disabled", async () => {
    const onPress = vi.fn();
    render(
      <Button onPress={onPress} isDisabled>
        Delete
      </Button>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onPress).not.toHaveBeenCalled();
  });
});
