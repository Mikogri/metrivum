import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { Dialog, Button } from "@trainflow/ui-web";
import { UserAutocomplete } from "./UserAutocomplete";
const api = vi.hoisted(() => vi.fn());
vi.mock("~/shared/session", () => ({ useApi: () => api, useAccountKey: () => "account" }));
beforeEach(() => { api.mockReset(); vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} }); });
function setup() {
  const selected = vi.fn();
  function Field() { const [value, setValue] = useState(""); const [open, setOpen] = useState(true); return <Dialog isOpen={open} onOpenChange={setOpen} title="Invite"><UserAutocomplete value={value} onChange={setValue} onSelect={selected} /><Button>Cancel</Button></Dialog>; }
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><Field /></QueryClientProvider>);
  return selected;
}
it("debounces search and fills the username after selecting a suggestion", async () => {
  api.mockResolvedValue({ data: [{ userId: "one", username: "alex", displayName: "Alex Example" }] });
  const selected = setup(); const user = userEvent.setup();
  const input = screen.getByRole("combobox", { name: "Username" });
  await user.click(input); await user.type(input, "al");
  expect(api).not.toHaveBeenCalled();
  await user.click(await screen.findByRole("option", { name: /alex/ }));
  expect(screen.getByRole("button", { name: "Cancel" })).toBeVisible(); expect(input).toHaveValue("alex"); expect(selected).toHaveBeenCalledWith(expect.objectContaining({ userId: "one" }));
  expect(api).toHaveBeenCalledWith(expect.objectContaining({ path: "/api/v1/accounts/people", query: { search: "al" }, signal: expect.any(AbortSignal) }));
});
it("hides stale suggestions immediately when the search changes", async () => {
  api.mockResolvedValue({ data: [{ userId: "one", username: "alex", displayName: "Alex" }] });
  setup(); const input = screen.getByRole("combobox");
  await userEvent.click(input); fireEvent.change(input, { target: { value: "al" } });
  await screen.findByRole("option", { name: /alex/ });
  fireEvent.change(input, { target: { value: "bo" } });
  expect(screen.queryByRole("option", { name: /alex/ })).toBeNull();
});
it("shows a search error without silently presenting an empty result", async () => {
  api.mockRejectedValue(new Error("offline")); setup();
  fireEvent.change(screen.getByRole("combobox"), { target: { value: "al" } });
  await waitFor(() => expect(screen.getByText("Could not search users. Try again.")).toBeVisible());
});
