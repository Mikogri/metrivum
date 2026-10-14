import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AuthCallback from "./callback";
import { callbackUrl } from "../lib/urls";

const mocks = vi.hoisted(() => ({ exchangeCodeForSession: vi.fn(), verifyOtp: vi.fn(), signOut: vi.fn(), completeSignIn: vi.fn() }));
const manager = { client: () => ({ auth: mocks }), completeSignIn: mocks.completeSignIn };
vi.mock("~/shared/session/SessionProvider", () => ({ useSessionManager: () => manager, useSessionState: () => ({ phase: "ready" }) }));
function open(url: string) {
  return render(<MemoryRouter initialEntries={[new URL(url, window.location.origin).pathname + new URL(url, window.location.origin).search]}><Routes><Route path="/auth/callback" element={<AuthCallback />} /><Route path="/app/dashboard" element={<p>Authorized destination</p>} /><Route path="/auth/reset-password" element={<p>Recovery destination</p>} /></Routes></MemoryRouter>);
}
beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  const result = { data: { session: { user: { id: "expected", email: "member@example.test" } } }, error: null };
  mocks.exchangeCodeForSession.mockResolvedValue(result);
  mocks.verifyOtp.mockResolvedValue(result);
  mocks.signOut.mockResolvedValue({ error: null });
});
describe("browser-bound authentication callbacks", () => {
  it.each(["code=unsolicited", "token_hash=attacker&type=email"])("rejects unsolicited %s before contacting Auth", async (query) => {
    open(`/auth/callback?slot=0&${query}`);
    await screen.findByRole("alert");
    await waitFor(() => expect(document.querySelector('[role="status"]')).toBeNull());
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
    expect(mocks.exchangeCodeForSession).not.toHaveBeenCalled();
    expect(mocks.completeSignIn).not.toHaveBeenCalled();
  });
  it.each(["code=expected", "token_hash=expected&type=email"])("accepts initiated %s in another page load", async (query) => {
    const url = callbackUrl(0, "/app/dashboard", "member@example.test");
    open(`${url}&${query}`);
    await screen.findByText("Authorized destination");
    expect(mocks.completeSignIn).toHaveBeenCalledOnce();
  });
  it("rejects a substituted account even with a valid callback nonce", async () => {
    const url = callbackUrl(0, "/app/dashboard", "other@example.test");
    open(`${url}&token_hash=attacker&type=email`);
    await waitFor(() => expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" }));
    expect(mocks.completeSignIn).not.toHaveBeenCalled();
  });
  it("preserves initiated password recovery", async () => {
    open(`${callbackUrl(0, "/auth/reset-password", "member@example.test")}&token_hash=recovery&type=recovery`);
    await screen.findByText("Recovery destination");
    expect(mocks.completeSignIn).toHaveBeenCalledOnce();
  });
  it("rejects duplicate nonce parameters without consuming a legitimate request", async () => {
    const url = callbackUrl(0, "/app/dashboard", "member@example.test");
    open(`${url}&nonce=attacker&token_hash=attacker&type=email`);
    await screen.findByRole("alert");
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
    expect(localStorage.getItem("tf.auth.callback.0")).not.toBeNull();
  });
});
