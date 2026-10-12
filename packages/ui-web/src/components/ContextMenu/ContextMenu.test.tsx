import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { ContextMenu } from "./ContextMenu";

afterEach(() => vi.restoreAllMocks());

it("presents contextual actions and inline editors in a phone dialog", async () => {
  vi.spyOn(window, "matchMedia").mockImplementation(query => ({
    matches: query === "(max-width: 767px)", media: query, onchange: null,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => true,
  }));
  const onAction = vi.fn();
  const onClose = vi.fn();
  render(<ContextMenu x={280} y={600} label="Set actions" onAction={onAction} onClose={onClose}
    items={[{ id: "copy", label: "Copy set" }, { id: "delete", label: "Delete set", isDisabled: true }]}>
    <input aria-label="Comment" />
  </ContextMenu>);
  expect(screen.getByRole("dialog", { name: "Set actions" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Delete set" })).toBeDisabled();
  await userEvent.type(screen.getByRole("textbox", { name: "Comment" }), "Keep this note");
  expect(onClose).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole("button", { name: "Copy set" }));
  expect(onAction).toHaveBeenCalledWith("copy");
  expect(onClose).toHaveBeenCalledOnce();
});
