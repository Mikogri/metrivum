import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, expect, it, vi } from "vitest";
import { IntegrationMenu } from "./IntegrationMenu";
import { connectionStatus } from "./api";
import { Integrations } from "./integrations";
import ActionApproval from "./action-approval";
import Consent, { verifiedRedirect } from "./consent";

vi.mock("~/shared/access", () => ({ useFeatureAccess: () => ({ allowed: state.allowed }) }));
const state = vi.hoisted(() => ({ api: vi.fn(), allowed: true, current: true, actionStatus: "Pending" }));
vi.mock("~/shared/session/AccountScope", () => ({ useAccountContext: () => ({ api: state.api, accountKey: "coach", account: { email: "coach@example.test" }, lifecycle: { isCurrent: () => state.current, signal: () => new AbortController().signal } }) }));
vi.mock("~/shared/http/config", () => ({ apiBaseUrl: () => "https://api.example.test" }));
const connection = { id: "connection", clientId: "client", clientName: "Test assistant", grants: ["read_training"], createdAt: "2026-10-14", lastUsedAt: null, revokedAt: null, version: 3 };
const action = { id: "action", connectionId: "connection", clientName: "Test assistant", type: "SendMessage", status: "Pending", conversationTitle: "Coaching", conversationId: "conversation", recipients: [{ userId: "client", displayName: "Client Alice" }], body: "Your exact approved message", payloadHash: "hash", createdAt: "2026-10-14", expiresAt: "2099-01-01", version: 4 };
const assignmentAction = { ...action, type: "AssignProgram", recipients: [], body: "", assignment: {
  request: { programId: "program", relationshipId: "relationship", revisionId: "published-revision", startDate: "2026-11-05", timeZone: "Europe/Warsaw" },
  clientId: "client", clientName: "Client Alice", programName: "Reviewed strength plan", publishedVersion: 3,
  currentAssignments: [{ id: "prior-assignment", programName: "Current endurance plan", effectiveRevisionId: "previous-revision", status: "Active", version: 2 }],
  effect: "Adds one assignment", contextHash: "frozen-context",
} };
beforeEach(() => {
  state.allowed = true;
  state.current = true;
  state.actionStatus = "Pending";
  state.api.mockReset().mockImplementation(async ({ path, method }: { path: string; method?: string }) => {
    if (path.includes("/ai-actions/") && method === "POST") state.actionStatus = path.endsWith("/reject") ? "Rejected" : "Executed";
    return { data:
    path.endsWith("/ai-integrations") ? [connection] : path.endsWith("/ai-activity") ? [] : path.endsWith("/ai-actions") ? [action] : path.includes("/ai-actions/") ? { ...action, status: state.actionStatus } :
    path.includes("/ai-consent/") ? { authorizationId: "verified", clientId: "verified-client", clientName: "Verified assistant", redirectUri: "https://assistant.example.test/callback", scopes: ["openid"], availableGrants: ["read_training", "write_training_drafts"] } : { note: "", shareWithIntegrations: false, version: 1 } };
  });
});
function setup(element: React.ReactNode, path = "/") {
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={cache}><MemoryRouter initialEntries={[path]}><Routes><Route path="*" element={element} /></Routes></MemoryRouter></QueryClientProvider>);
  return cache;
}
it("uses versioned server requests to change grants and revoke a connection", async () => {
  setup(<Integrations />);
  await screen.findByRole("heading", { name: "Test assistant" });
  await userEvent.click(screen.getByRole("button", { name: "Manage access" }));
  await userEvent.click(screen.getByRole("checkbox", { name: "Create and edit private training drafts" }));
  await userEvent.click(screen.getByRole("button", { name: "Save permissions" }));
  await waitFor(() => expect(state.api).toHaveBeenCalledWith(expect.objectContaining({ method: "PATCH", path: "/api/v1/me/ai-integrations/connection/grants", json: { grants: ["read_training", "write_training_drafts"], expectedVersion: 3 } })));
  await userEvent.click(screen.getByRole("button", { name: "Disconnect" }));
  await waitFor(() => expect(state.api).toHaveBeenCalledWith(expect.objectContaining({ method: "POST", path: "/api/v1/me/ai-integrations/connection/revoke" })));
});
it("shows the exact recipients and text and never approves until the user clicks Send", async () => {
  setup(<Routes><Route path="/actions/:actionId" element={<ActionApproval />} /></Routes>, "/actions/action");
  await screen.findByText("Client Alice");
  expect(screen.getByText(action.body)).toBeInTheDocument();
  expect(state.api.mock.calls.every(([r]) => r.method !== "POST")).toBe(true);
  await userEvent.click(screen.getByRole("button", { name: "Send this message" }));
  await waitFor(() => expect(state.api).toHaveBeenCalledWith(expect.objectContaining({ method: "POST", path: "/api/v1/me/ai-actions/action/approve", json: { expectedVersion: 4 } })));
  await screen.findByText("Message sent");
});
it("renders only server-verified OAuth identity and starts with every requested grant selected", async () => {
  setup(<Consent />, "/?authorization_id=verified&client_name=Spoofed&redirect_uri=https://attacker.test");
  await screen.findByRole("heading", { name: "Connect Verified assistant" });
  expect(screen.queryByText("Spoofed")).not.toBeInTheDocument();
  expect(screen.getByText("https://assistant.example.test/callback")).toBeInTheDocument();
  expect(screen.getByText("All permissions (2)")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Allow selected permissions" })).toBeEnabled();
});
it("asks for confirmation, then submits only the selected permissions", async () => {
  setup(<Consent />, "/?authorization_id=verified&client_id=attacker");
  await screen.findByRole("heading", { name: "Connect Verified assistant" });
  await userEvent.click(screen.getByRole("button", { name: /Permissions/ }));
  await userEvent.click(await screen.findByRole("option", { name: "Create and edit private training drafts" }));
  await userEvent.keyboard("{Escape}");
  expect(screen.getByText("1 of 2 permissions")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Allow selected permissions" }));
  const dialog = await screen.findByRole("alertdialog", { name: "Allow Verified assistant to access Metrivum?" });
  expect(state.api.mock.calls.some(([r]) => r.method === "POST")).toBe(false);
  state.api.mockImplementationOnce(async () => { throw new Error("Provider unavailable"); });
  await userEvent.click(within(dialog).getByRole("button", { name: "Allow access" }));
  await waitFor(() => expect(state.api).toHaveBeenCalledWith(expect.objectContaining({ method: "POST", path: "/api/v1/me/ai-consent/verified", json: { grants: ["read_training"] } })));
  await screen.findByText("Provider unavailable");
});
it("denies the verified OAuth request without persisting any grants", async () => {
  setup(<Consent />, "/?authorization_id=verified");
  await screen.findByRole("heading", { name: "Connect Verified assistant" });
  state.api.mockImplementationOnce(async () => { throw new Error("Provider unavailable"); });
  await userEvent.click(screen.getByRole("button", { name: "Deny" }));
  await waitFor(() => expect(state.api).toHaveBeenCalledWith(expect.objectContaining({ method: "POST", path: "/api/v1/me/ai-consent/verified/deny" })));
  expect(state.api.mock.calls.find(([r]) => r.method === "POST")![0].json).toBeUndefined();
});
it("saves an opt-in preference note with the current server version", async () => {
  setup(<Integrations />);
  const note = await screen.findByRole("textbox", { name: "Programming preferences" });
  await userEvent.type(note, "Keep exercise order");
  await userEvent.click(screen.getByRole("checkbox", { name: "Share this note with connected assistants" }));
  await userEvent.click(screen.getByRole("button", { name: "Save preferences" }));
  await waitFor(() => expect(state.api).toHaveBeenCalledWith(expect.objectContaining({ method: "PATCH", path: "/api/v1/me/ai-programming-preferences", json: { note: "Keep exercise order", shareWithIntegrations: true, expectedVersion: 1 } })));
});
it("rejects only the current pending action version", async () => {
  setup(<Routes><Route path="/actions/:actionId" element={<ActionApproval />} /></Routes>, "/actions/action");
  await screen.findByText("Client Alice");
  await userEvent.click(screen.getByRole("button", { name: "Reject" }));
  await waitFor(() => expect(state.api).toHaveBeenCalledWith(expect.objectContaining({ method: "POST", path: "/api/v1/me/ai-actions/action/reject", json: { expectedVersion: 4 } })));
  await screen.findByText("Action rejected");
  expect(screen.queryByRole("button", { name: "Send this message" })).not.toBeInTheDocument();
});
it("does not offer approval of an expired pending action", async () => {
  state.api.mockResolvedValueOnce({ data: { ...action, expiresAt: "2020-01-01" } });
  setup(<Routes><Route path="/actions/:actionId" element={<ActionApproval />} /></Routes>, "/actions/action");
  await screen.findByText("This action has expired");
  expect(screen.queryByRole("button", { name: "Send this message" })).not.toBeInTheDocument();
});
it("does not approve an unsupported action type through the message screen", async () => {
  state.api.mockResolvedValueOnce({ data: { ...action, type: "AssignCheckIn" } });
  setup(<Routes><Route path="/actions/:actionId" element={<ActionApproval />} /></Routes>, "/actions/action");
  await screen.findByText("This action type is not supported by this review screen");
  expect(screen.queryByRole("button", { name: "Send this message" })).not.toBeInTheDocument();
});
it("reviews the frozen client, program revision, start date and existing assignments before approval", async () => {
  state.api.mockResolvedValueOnce({ data: assignmentAction });
  setup(<Routes><Route path="/actions/:actionId" element={<ActionApproval />} /></Routes>, "/actions/action");
  await screen.findByText("Reviewed strength plan (program)");
  expect(screen.getByText("Client Alice (client)")).toBeInTheDocument();
  expect(screen.getByText("3 (published-revision)")).toBeInTheDocument();
  expect(screen.getByText("2026-11-05")).toBeInTheDocument();
  expect(screen.getByText("Europe/Warsaw")).toBeInTheDocument();
  expect(screen.getByText("Current endurance plan · Active · 2")).toBeInTheDocument();
  expect(screen.getByText(/Existing assignments and workout history remain unchanged/)).toBeInTheDocument();
  expect(state.api.mock.calls.every(([request]) => request.method !== "POST")).toBe(true);
  state.api.mockResolvedValueOnce({ data: { ...assignmentAction, status: "Approved" } });
  await userEvent.click(screen.getByRole("button", { name: "Approve this assignment" }));
  await waitFor(() => expect(state.api).toHaveBeenCalledWith(expect.objectContaining({ method: "POST", path: "/api/v1/me/ai-actions/action/approve", json: { expectedVersion: 4 } })));
});
it("lets the owner reject an already approved assignment before the assistant executes it", async () => {
  state.api.mockResolvedValueOnce({ data: { ...assignmentAction, status: "Approved" } });
  setup(<Routes><Route path="/actions/:actionId" element={<ActionApproval />} /></Routes>, "/actions/action");
  await screen.findByText("Approved; awaiting execution by your assistant");
  expect(screen.queryByRole("button", { name: "Approve this assignment" })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Reject" }));
  await waitFor(() => expect(state.api).toHaveBeenCalledWith(expect.objectContaining({ method: "POST", path: "/api/v1/me/ai-actions/action/reject", json: { expectedVersion: 4 } })));
});
it("shows separate read/action permissions, forbidden capabilities and durable AI activity", async () => {
  state.api.mockImplementation(async ({ path }: { path: string }) => ({ data: path.endsWith("/ai-integrations") ? [connection] : path.endsWith("/ai-actions") ? [] : path.endsWith("/ai-activity") ? [{ connectionId: "connection", clientName: "Test assistant", operation: "create_program_draft", status: "Executed", at: "2026-11-04" }] : { note: "", shareWithIntegrations: false, version: 1 } }));
  setup(<Integrations />);
  await screen.findByText("Test assistant · create_program_draft");
  await userEvent.click(screen.getByRole("button", { name: "Manage access" }));
  expect(screen.getByRole("heading", { name: "Read access" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Actions" })).toBeInTheDocument();
  expect(screen.getByRole("checkbox", { name: "Assign published programs to one client after your approval" })).not.toBeChecked();
  expect(screen.getByText("AI cannot manage payments, subscriptions, account permissions or end client collaborations.")).toBeInTheDocument();
});
it("refreshes an approved action after the assistant executes it", async () => {
  state.api.mockImplementation(async ({ method }: { method?: string }) => {
    if (method === "POST") state.actionStatus = "Approved";
    return { data: { ...action, status: state.actionStatus } };
  });
  setup(<Routes><Route path="/actions/:actionId" element={<ActionApproval />} /></Routes>, "/actions/action");
  await screen.findByText("Client Alice");
  await userEvent.click(screen.getByRole("button", { name: "Send this message" }));
  await screen.findByText("Approved; awaiting execution by your assistant");
  state.actionStatus = "Executed";
  await userEvent.click(screen.getByRole("button", { name: "Reload current action" }));
  await screen.findByText("Message sent");
});
it.each(["https://attacker.test/callback", "https://assistant.example.test/other", "javascript:alert(1)", "https://user:password@assistant.example.test/callback"])("refuses an OAuth redirect outside the verified callback: %s", url => {
  expect(() => verifiedRedirect(url, "https://assistant.example.test/callback")).toThrow();
});
it("allows an authorization response on the verified HTTPS callback and loopback development callback", () => {
  expect(verifiedRedirect("https://assistant.example.test/callback?code=one&state=two", "https://assistant.example.test/callback")).toContain("?code=one&state=two");
  expect(verifiedRedirect("http://localhost:9000/callback?error=denied", "http://localhost:9000/callback")).toContain("?error=denied");
  expect(() => verifiedRedirect("http://assistant.example.test/callback", "http://assistant.example.test/callback")).toThrow();
});
it("does not update the cache after an account switch finishes an earlier mutation", async () => {
  const cache = setup(<Integrations />);
  await screen.findByRole("heading", { name: "Test assistant" });
  let release!: (value: unknown) => void;
  state.api.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
  await userEvent.click(screen.getByRole("button", { name: "Disconnect" }));
  state.current = false;
  const calls = state.api.mock.calls.length;
  await act(async () => { release({ data: { ...connection, revokedAt: "2026-10-14" } }); });
  expect(state.api.mock.calls).toHaveLength(calls);
  expect(cache.getQueryData(["coach", "integrations", "/api/v1/me/ai-integrations", undefined])).toEqual([connection]);
});

it("derives consent status without assuming provider availability", () => {
  expect(connectionStatus(connection)).toBe("active");
  expect(connectionStatus({ ...connection, grants: [] })).toBe("attention");
  expect(connectionStatus({ ...connection, revokedAt: "2026-11-06" })).toBe("revoked");
});
it("opens the app bar integration summary and closes with Escape", async () => {
  setup(<IntegrationMenu />);
  const trigger = await screen.findByRole("button", { name: "AI integrations connected" });
  await userEvent.click(trigger);
  expect(await screen.findByRole("dialog", { name: "AI Integrations" })).toBeInTheDocument();
  expect(screen.getByText("Test assistant")).toBeInTheDocument();
  await userEvent.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
});
it("does not show an API failure as a disconnected assistant", async () => {
  state.api.mockRejectedValue(new Error("Unavailable"));
  setup(<IntegrationMenu />);
  const trigger = await screen.findByRole("button", { name: "Could not load integration status" });
  await userEvent.click(trigger);
  expect(screen.queryByText("No AI assistants connected")).not.toBeInTheDocument();
});
it("offers setup when no consent exists", async () => {
  state.api.mockResolvedValue({ data: [] });
  setup(<IntegrationMenu />);
  await userEvent.click(await screen.findByRole("button", { name: "Connect an assistant" }));
  expect(await screen.findByText("No AI assistants connected")).toBeInTheDocument();
});

it("shows attention only for unrevoked consent with no permissions", async () => {
  state.api.mockResolvedValue({ data: [{ ...connection, grants: [] }] });
  setup(<IntegrationMenu />);
  expect(await screen.findByRole("button", { name: "AI integration requires attention" })).toBeInTheDocument();
});
it("does not fetch connections or expose management without connect access", () => {
  state.allowed = false;
  setup(<IntegrationMenu />);
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
  expect(state.api).not.toHaveBeenCalled();
});

it("navigates from the empty popover to available integrations", async () => {
  state.api.mockResolvedValue({ data: [] });
  setup(<Routes><Route path="/" element={<IntegrationMenu />} /><Route path="/app/settings" element={<p>Integration settings destination</p>} /></Routes>);
  await userEvent.click(await screen.findByRole("button", { name: "Connect an assistant" }));
  const buttons = screen.getAllByRole("button", { name: "Connect an assistant" });
  await userEvent.click(buttons[buttons.length - 1]);
  expect(await screen.findByText("Integration settings destination")).toBeInTheDocument();
});
