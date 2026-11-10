import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { useState } from "react";
import { ContextMenu } from "./ContextMenu";

afterEach(() => vi.restoreAllMocks());

it("presents contextual actions and inline editors in a phone dialog", async () => {
  vi.spyOn(window, "matchMedia").mockImplementation((query) => ({
    matches: query === "(max-width: 767px)",
    media: query,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => true,
  }));
  const onAction = vi.fn();
  const onClose = vi.fn();
  render(
    <ContextMenu
      x={280}
      y={600}
      label="Set actions"
      onAction={onAction}
      onClose={onClose}
      items={[
        { id: "copy", label: "Copy set" },
        { id: "delete", label: "Delete set", isDisabled: true },
      ]}
    >
      <input aria-label="Comment" />
    </ContextMenu>,
  );
  expect(
    screen.getByRole("dialog", { name: "Set actions" }),
  ).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Delete set" })).toBeDisabled();
  await userEvent.type(
    screen.getByRole("textbox", { name: "Comment" }),
    "Keep this note",
  );
  expect(onClose).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole("button", { name: "Copy set" }));
  expect(onAction).toHaveBeenCalledWith("copy");
  expect(onClose).toHaveBeenCalledOnce();
});

it("keeps portaled menu labels, fields and actions inside the menu event boundary", async () => {
  const pointer = vi.fn();
  const click = vi.fn();
  const key = vi.fn();
  const action = vi.fn();
  render(
    <div onPointerDown={pointer} onClick={click} onKeyDown={key}>
      <ContextMenu
        x={10}
        y={20}
        label="Actions"
        onAction={action}
        onClose={vi.fn()}
        items={[
          { type: "label", id: "label", label: "Formula inputs" },
          { id: "apply", label: "Apply formula" },
        ]}
      >
        <input aria-label="Formula" />
      </ContextMenu>
    </div>,
  );
  fireEvent.pointerDown(screen.getByText("Formula inputs"), { button: 0 });
  expect(pointer).not.toHaveBeenCalled();
  await userEvent.type(
    screen.getByRole("textbox", { name: "Formula" }),
    "maxBench1r",
  );
  expect(key).not.toHaveBeenCalled();
  expect(pointer).not.toHaveBeenCalled();
  await userEvent.click(
    screen.getByRole("menuitem", { name: "Apply formula" }),
  );
  expect(action).toHaveBeenCalledExactlyOnceWith("apply");
  expect(click).not.toHaveBeenCalled();
});

it("consumes the outside dismissal gesture and permits the next fresh press", async () => {
  const pointer = vi.fn();
  const click = vi.fn();
  function Example() {
    const [open, setOpen] = useState(true);
    return (
      <div onPointerDown={pointer} onClick={click}>
        <button type="button">Underlying card</button>
        {open ? (
          <ContextMenu
            x={10}
            y={20}
            label="Actions"
            onAction={vi.fn()}
            onClose={() => setOpen(false)}
            items={[]}
          />
        ) : null}
      </div>
    );
  }
  render(<Example />);
  await userEvent.click(
    screen.getByRole("button", { name: "Underlying card" }),
  );
  expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  expect(pointer).not.toHaveBeenCalled();
  expect(click).not.toHaveBeenCalled();
  await userEvent.click(
    screen.getByRole("button", { name: "Underlying card" }),
  );
  expect(pointer).toHaveBeenCalledOnce();
  expect(click).toHaveBeenCalledOnce();
});

it("keeps the opening scroll from dismissing the menu but closes on subsequent scrolling", () => {
  let frame: FrameRequestCallback | undefined;
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    frame = callback;
    return 1;
  });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
  const close = vi.fn();
  render(
    <ContextMenu
      x={10}
      y={20}
      label="Column actions"
      onAction={vi.fn()}
      onClose={close}
      items={[{ id: "reset", label: "Reset column width" }]}
    />,
  );
  fireEvent.scroll(window);
  expect(close).not.toHaveBeenCalled();
  act(() => frame?.(16));
  fireEvent.scroll(window);
  expect(close).toHaveBeenCalledOnce();
});
