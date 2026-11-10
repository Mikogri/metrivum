import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState, StrictMode } from "react";
import { describe, expect, it, vi } from "vitest";
import { Button } from "../../primitives/Button/Button";
import { AlertDialog, Dialog, DialogTrigger } from "./Dialog";

describe("Dialog", () => {
  it("does not create an exit copy during StrictMode opening", async () => {
    const animate = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "animate",
    );
    Object.defineProperty(HTMLElement.prototype, "animate", {
      configurable: true,
      value: vi.fn(),
    });
    try {
      const view = render(
        <StrictMode>
          <Dialog isOpen title="Single formula dialog" />
        </StrictMode>,
      );
      await Promise.resolve();
      expect(document.querySelectorAll("[data-exiting][inert]")).toHaveLength(
        0,
      );
      expect(screen.getAllByRole("dialog")).toHaveLength(1);
      view.unmount();
      await Promise.resolve();
      document
        .querySelectorAll("[data-exiting][inert]")
        .forEach((node) => node.remove());
    } finally {
      if (animate)
        Object.defineProperty(HTMLElement.prototype, "animate", animate);
      else Reflect.deleteProperty(HTMLElement.prototype, "animate");
    }
  });
  it.each([false, true])(
    "labels a triggered dialog from its title (controlled=%s)",
    async (controlled) => {
      function TriggeredDialog() {
        const [open, setOpen] = useState(false);
        return (
          <DialogTrigger
            {...(controlled ? { isOpen: open, onOpenChange: setOpen } : {})}
          >
            <Button>Assign</Button>
            <Dialog title="Assign program" size="lg">
              <input aria-label="Program" />
            </Dialog>
          </DialogTrigger>
        );
      }
      render(<TriggeredDialog />);
      await userEvent.click(screen.getByRole("button", { name: "Assign" }));
      expect(
        screen.getByRole("dialog", { name: "Assign program" }),
      ).toBeInTheDocument();
    },
  );

  it("traps focus, labels itself and closes on Escape", async () => {
    const onOpenChange = vi.fn();
    render(
      <Dialog
        isOpen
        onOpenChange={onOpenChange}
        title="Rename"
        closeLabel="Close"
      >
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
      <AlertDialog
        isOpen
        title="Delete folder?"
        tone="danger"
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={() => {}}
      >
        <p>Only empty folders can be deleted.</p>
      </AlertDialog>,
    );
    expect(
      screen.getByRole("alertdialog", { name: "Delete folder?" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
  });

  it("renders footer actions with the close callback", async () => {
    const onOpenChange = vi.fn();
    render(
      <Dialog
        isOpen
        onOpenChange={onOpenChange}
        title="Export"
        footer={(close) => <Button onPress={close}>Done</Button>}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("closes when its controlled owner accepts dismissal", async () => {
    function ControlledDialog() {
      const [open, setOpen] = useState(true);
      return <Dialog isOpen={open} onOpenChange={setOpen} title="Rename" />;
    }
    render(<ControlledDialog />);
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(
      screen.queryByRole("dialog", { name: "Rename" }),
    ).not.toBeInTheDocument();
  });

  it("keeps a guarded drawer mounted while its close confirmation is open", async () => {
    function Draft() {
      const [text, setText] = useState("");
      return (
        <input
          aria-label="Review"
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
      );
    }
    function GuardedDrawer() {
      const [open, setOpen] = useState(true);
      const [confirm, setConfirm] = useState(false);
      return (
        <>
          <Dialog
            isOpen={open}
            title="Review details"
            placement="right"
            onOpenChange={() => setConfirm(true)}
          >
            <Draft />
          </Dialog>
          <AlertDialog
            isOpen={confirm}
            title="Discard unsaved review?"
            cancelLabel="Keep editing"
            confirmLabel="Discard changes"
            onOpenChange={setConfirm}
            onConfirm={() => {
              setConfirm(false);
              setOpen(false);
            }}
          >
            Unsaved review
          </AlertDialog>
        </>
      );
    }
    const user = userEvent.setup();
    render(<GuardedDrawer />);
    const input = screen.getByRole("textbox", { name: "Review" });
    await user.type(input, "Unsaved feedback");
    await user.keyboard("{Escape}");
    const confirmation = await screen.findByRole("alertdialog", {
      name: "Discard unsaved review?",
    });
    // Closing was rejected: remounting the drawer would erase the draft and reorder overlays.
    expect(input).toBeInTheDocument();
    expect(input).toHaveValue("Unsaved feedback");
    await user.click(
      within(confirmation).getByRole("button", { name: "Keep editing" }),
    );
    expect(screen.getByRole("textbox", { name: "Review" })).toBe(input);
    expect(input).toHaveValue("Unsaved feedback");
    await user.keyboard("{Escape}");
    await user.click(
      within(
        await screen.findByRole("alertdialog", {
          name: "Discard unsaved review?",
        }),
      ).getByRole("button", { name: "Discard changes" }),
    );
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(input).not.toBeInTheDocument();
  });
});
