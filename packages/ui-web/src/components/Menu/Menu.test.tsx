import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Button } from "../../primitives/Button/Button";
import { DropdownMenu, DropdownMenuItem, DropdownMenuTrigger } from "./Menu";

afterEach(() => vi.restoreAllMocks());

describe("responsive action menu", () => {
  it.each([true, false])("keeps menu actions and restores trigger focus (phone=%s)", async (phone) => {
    vi.spyOn(window, "matchMedia").mockImplementation(query => ({
      matches: phone && query === "(max-width: 767px)", media: query, onchange: null,
      addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => true,
    }));
    const action = vi.fn();
    render(<DropdownMenuTrigger>
      <Button>Actions</Button>
      <DropdownMenu aria-label="Workout actions" onAction={action}>
        <DropdownMenuItem id="edit">Edit workout</DropdownMenuItem>
        <DropdownMenuItem id="delete" isDisabled>Delete workout</DropdownMenuItem>
      </DropdownMenu>
    </DropdownMenuTrigger>);
    const user = userEvent.setup();
    const trigger = screen.getByRole("button", { name: "Actions" });
    await user.click(trigger);
    const menu = screen.getByRole("menu", { name: "Actions" });
    expect(Boolean(menu.closest("[data-mobile-sheet]"))).toBe(phone);
    expect(screen.getByRole("menuitem", { name: "Delete workout" })).toHaveAttribute("aria-disabled", "true");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
    await user.click(trigger);
    await user.click(screen.getByRole("menuitem", { name: "Edit workout" }));
    expect(action.mock.calls[0]?.[0]).toBe("edit");
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
  });
});
