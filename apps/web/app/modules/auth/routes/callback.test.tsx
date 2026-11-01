import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AuthCallback from "./callback";
import { beginCallbackAttempt } from "../lib/callback-attempt";
import { callbackUrl } from "../lib/urls";

const mocks = vi.hoisted(() => ({ exchangeCodeForSession: vi.fn(), verifyOtp: vi.fn(), signOut: vi.fn(), completeSignIn: vi.fn(), state: { phase: "ready", accounts: [] as {slot: number; userId: string}[], generation: 0 } }));
const manager = { client: () => ({ auth: mocks }), completeSignIn: mocks.completeSignIn, getState: () => mocks.state };
vi.mock("~/shared/session/SessionProvider", () => ({ useSessionManager: () => manager, useSessionState: () => mocks.state }));
function open(url: string) {
  return render(<MemoryRouter initialEntries={[new URL(url, window.location.origin).pathname + new URL(url, window.location.origin).search]}><Routes><Route path="/auth/callback" element={<AuthCallback />} /><Route path="/app/dashboard" element={<p>Authorized destination</p>} /><Route path="/auth/reset-password" element={<p>Recovery destination</p>} /></Routes></MemoryRouter>);
}
beforeEach(() => {
  localStorage.clear();
  mocks.state = { phase: "ready", accounts: [], generation: 0 };
  vi.clearAllMocks();
  const result = { data: { session: { user: { id: "expected", email: "member@example.test" } } }, error: null };
  mocks.exchangeCodeForSession.mockResolvedValue(result);
  mocks.verifyOtp.mockResolvedValue(result);
  mocks.signOut.mockResolvedValue({ error: null });
  mocks.completeSignIn.mockResolvedValue(0);
  sessionStorage.clear();
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
    // Only this tab may now open the new-password form, and only for this account.
    expect(JSON.parse(sessionStorage.getItem("tf.auth.recovery.0")!)).toMatchObject({ userId: "expected" });
  });
  it("does not unlock the password form after an ordinary sign-in link", async () => {
    open(`${callbackUrl(0, "/app/dashboard", "member@example.test")}&code=expected`);
    await screen.findByText("Authorized destination");
    expect(sessionStorage.getItem("tf.auth.recovery.0")).toBeNull();
  });
  it("rejects duplicate nonce parameters without consuming a legitimate request", async () => {
    const url = callbackUrl(0, "/app/dashboard", "member@example.test");
    open(`${url}&nonce=attacker&token_hash=attacker&type=email`);
    await screen.findByRole("alert");
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
    expect(localStorage.getItem("tf.auth.callback.0")).not.toBeNull();
  });
});

describe("email change account binding", () => {
  it("ends the working screen without applying a response from a previous account lifetime", async () => {
    mocks.state.accounts = [{ slot: 0, userId: "expected" }];
    const nonce = beginCallbackAttempt(0, "member@example.test", "email-change", "expected");
    let resolve!: (value: unknown) => void;
    mocks.verifyOtp.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    open(`/auth/callback?flow=email-change&slot=0&nonce=${nonce}&token_hash=valid&type=email_change`);
    await waitFor(() => expect(mocks.verifyOtp).toHaveBeenCalledOnce());
    mocks.state.generation += 1;
    resolve({ data: { session: { user: { id: "expected", email: "member@example.test" } } }, error: null });
    await screen.findByRole("alert");
    expect(mocks.completeSignIn).not.toHaveBeenCalled();
    expect(localStorage.getItem("tf.auth.callback.email-change.0")).not.toBeNull();
  });
  it("rejects an unsolicited email-change link before calling Auth", async () => {
    mocks.state.accounts = [{ slot: 0, userId: "expected" }];
    open("/auth/callback?flow=email-change&slot=0&code=attacker");
    await screen.findByRole("alert");
    expect(mocks.exchangeCodeForSession).not.toHaveBeenCalled();
  });
  it("rejects an initiated change after the slot belongs to another user", async () => {
    const nonce = beginCallbackAttempt(0, "member@example.test", "email-change", "old-user");
    mocks.state.accounts = [{ slot: 0, userId: "expected" }];
    open(`/auth/callback?flow=email-change&slot=0&nonce=${nonce}&token_hash=valid&type=email_change`);
    await screen.findByRole("alert");
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
  });
  it("retains the nonce after the first confirmation and consumes it after the final confirmation", async () => {
    mocks.state.accounts = [{ slot: 0, userId: "expected" }];
    const nonce = beginCallbackAttempt(0, "member@example.test", "email-change", "expected");
    mocks.verifyOtp.mockResolvedValueOnce({ data: { session: null }, error: null });
    const url = `/auth/callback?flow=email-change&slot=0&nonce=${nonce}&token_hash=valid&type=email_change`;
    const first = open(url);
    await waitFor(() => expect(mocks.verifyOtp).toHaveBeenCalledOnce());
    expect(localStorage.getItem("tf.auth.callback.email-change.0")).not.toBeNull();
    first.unmount();
    open(url);
    await waitFor(() => expect(mocks.completeSignIn).toHaveBeenCalledOnce());
    expect(localStorage.getItem("tf.auth.callback.email-change.0")).toBeNull();
  });
});
