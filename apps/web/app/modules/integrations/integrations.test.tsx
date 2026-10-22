import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, expect, it, vi } from "vitest";
import { Integrations } from "./integrations";
import ActionApproval from "./action-approval";
import Consent, { verifiedRedirect } from "./consent";

const state = vi.hoisted(() => ({ api: vi.fn(), current: true, actionStatus: "Pending" }));
vi.mock("~/shared/session/AccountScope", () => ({ useAccountContext: () => ({ api: state.api, accountKey: "coach", account: { email: "coach@example.test" }, lifecycle: { isCurrent: () => state.current, signal: () => new AbortController().signal } }) }));
vi.mock("~/shared/http/config", () => ({ apiBaseUrl: () => "https://api.example.test" }));
const connection = { id: "connection", clientId: "client", clientName: "Test assistant", grants: ["read_training"], createdAt: "2026-10-14", lastUsedAt: null, revokedAt: null, version: 3 };
const action = { id: "action", connectionId: "connection", clientName: "Test assistant", type: "SendMessage", status: "Pending", conversationTitle: "Coaching", conversationId: "conversation", recipients: [{ userId: "client", displayName: "Client Alice" }], body: "Your exact approved message", payloadHash: "hash", createdAt: "2026-10-14", expiresAt: "2099-01-01", version: 4 };
beforeEach(() => {
  state.current = true;
  state.actionStatus = "Pending";
  state.api.mockReset().mockImplementation(async ({ path, method }: { path: string; method?: string }) => {
    if (path.includes("/ai-actions/") && method === "POST") state.actionStatus = path.endsWith("/reject") ? "Rejected" : "Executed";
    return { data:
    path.endsWith("/ai-integrations") ? [connection] : path.endsWith("/ai-actions") ? [action] : path.includes("/ai-actions/") ? { ...action, status: state.actionStatus } :
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
it("renders only server-verified OAuth identity and starts with all grants unchecked", async () => {
  setup(<Consent />, "/?authorization_id=verified&client_name=Spoofed&redirect_uri=https://attacker.test");
  await screen.findByRole("heading", { name: "Connect Verified assistant" });
  expect(screen.queryByText("Spoofed")).not.toBeInTheDocument();
  expect(screen.getByText("https://assistant.example.test/callback")).toBeInTheDocument();
  expect(screen.getAllByRole("checkbox").every(box => box.getAttribute("aria-checked") !== "true")).toBe(true);
  expect(screen.getByRole("button", { name: "Allow selected permissions" })).toBeDisabled();
});
it("submits only selected permissions to the verified consent request", async () => {
  setup(<Consent />, "/?authorization_id=verified&client_id=attacker");
  await screen.findByRole("heading", { name: "Connect Verified assistant" });
  state.api.mockImplementationOnce(async () => { throw new Error("Provider unavailable"); });
  await userEvent.click(screen.getByRole("checkbox", { name: "Read training programs and exercises" }));
  await userEvent.click(screen.getByRole("button", { name: "Allow selected permissions" }));
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
