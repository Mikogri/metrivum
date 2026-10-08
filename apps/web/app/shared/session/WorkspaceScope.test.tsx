import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspaceScope, useWorkspace } from "./WorkspaceScope";

const mocks = vi.hoisted(() => ({ api: vi.fn(), confirm: vi.fn(), dirty: vi.fn() }));
vi.mock("./AccountScope", () => ({ useApi: () => mocks.api, useAccountKey: () => "workspace-test" }));
vi.mock("~/shared/lib/useConfirm", () => ({ useDiscardConfirm: () => ({ confirm: mocks.confirm, dialog: null }) }));
vi.mock("./dirty-guard", () => ({ hasUnsavedWork: mocks.dirty }));

function Probe({ delayed }: { delayed: Promise<string> }) {
  const { mode, switchMode } = useWorkspace();
  const query = useQuery({ queryKey: ["workspace-test", "coaching", mode], queryFn: () => mode === "coach" ? delayed : Promise.resolve("Client data") });
  return <><p>Workspace: {mode}</p><p>{query.data}</p><button onClick={() => void switchMode("client")}>Switch to client</button></>;
}
function setup(roles: string[], delayed = Promise.resolve("Coach data")) {
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={cache}><MemoryRouter><WorkspaceScope roles={roles}><Probe delayed={delayed} /></WorkspaceScope></MemoryRouter></QueryClientProvider>);
}

beforeEach(() => { localStorage.clear(); mocks.api.mockReset(); mocks.confirm.mockReset(); mocks.dirty.mockReturnValue(false); });
describe("workspace lifecycle", () => {
  it("drops late coach data after switching into client mode", async () => {
    let release!: (value: string) => void;
    const delayed = new Promise<string>(resolve => { release = resolve; });
    setup(["Coach", "Client"], delayed);
    await userEvent.click(screen.getByRole("button", { name: "Switch to client" }));
    await screen.findByText("Client data");
    await act(async () => { release("Private coach data"); await delayed; });
    expect(screen.queryByText("Private coach data")).not.toBeInTheDocument();
    expect(localStorage.getItem("tf.workspace.workspace-test")).toBe("client");
  });
  it("keeps the current workspace when discarding a draft is cancelled", async () => {
    mocks.dirty.mockReturnValue(true); mocks.confirm.mockResolvedValue(false);
    setup(["Coach", "Client"]);
    await userEvent.click(screen.getByRole("button", { name: "Switch to client" }));
    await waitFor(() => expect(mocks.confirm).toHaveBeenCalledOnce());
    expect(screen.getByText("Workspace: coach")).toBeInTheDocument();
    expect(localStorage.getItem("tf.workspace.workspace-test")).toBeNull();
  });
  it("does not enter Client mode if explicit role activation fails", async () => {
    mocks.api.mockRejectedValue(new Error("Unavailable"));
    setup(["Coach"]);
    await userEvent.click(screen.getByRole("button", { name: "Switch to client" }));
    await screen.findByText("Could not switch workspace. Please try again.");
    expect(mocks.api).toHaveBeenCalledWith({ method: "POST", path: "/api/v1/me/roles/client" });
    expect(screen.getByText("Workspace: coach")).toBeInTheDocument();
  });
});
