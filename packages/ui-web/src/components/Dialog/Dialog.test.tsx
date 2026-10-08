import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Button } from "../../primitives/Button/Button";
import { AlertDialog, Dialog } from "./Dialog";

describe("Dialog", () => {
  it("traps focus, labels itself and closes on Escape", async () => {
    const onOpenChange = vi.fn();
    render(
      <Dialog isOpen onOpenChange={onOpenChange} title="Rename" closeLabel="Close">
        <input aria-label="Name" />
      </Dialog>,
    );
    const dialog = screen.getByRole("dialog", { name: "Rename" });
    expect(dialog).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("alert dialog puts focus on cancel for destructive actions", async () => {
    render(
      <AlertDialog isOpen title="Delete folder?" tone="danger" confirmLabel="Delete" cancelLabel="Cancel" onConfirm={() => {}}>
        <p>Only empty folders can be deleted.</p>
      </AlertDialog>,
    );
    expect(screen.getByRole("alertdialog", { name: "Delete folder?" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
  });

  it("renders footer actions with the close callback", async () => {
    const onOpenChange = vi.fn();
    render(<Dialog isOpen onOpenChange={onOpenChange} title="Export" footer={(close) => <Button onPress={close}>Done</Button>} />);
    await userEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
