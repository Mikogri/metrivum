import { AuthError } from "@supabase/supabase-js";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, expect, it, vi } from "vitest";
import { markPasswordRecovery } from "../lib/assurance";
import ResetPassword from "./reset-password";

const encode = (value: object) => btoa(JSON.stringify(value)).replace(/=+$/, "");
const mocks = vi.hoisted(() => ({
  updateUser: vi.fn(), signOut: vi.fn(), challengeAndVerify: vi.fn(), getSession: vi.fn(), completeSignIn: vi.fn(),
  state: { phase: "ready", activeSlot: 0 as number | null, accounts: [] as unknown[] },
}));
vi.mock("~/shared/session/SessionProvider", () => ({
  useSessionState: () => mocks.state,
  useSessionManager: () => ({ client: () => ({ auth: { updateUser: mocks.updateUser, signOut: mocks.signOut, getSession: mocks.getSession, mfa: { challengeAndVerify: mocks.challengeAndVerify } } }), completeSignIn: mocks.completeSignIn }),
}));
vi.mock("~/modules/accounts", () => ({ BootScreen: () => <p>Loading</p> }));

function account(aal: string, factors: unknown[] = []) {
  return { slot: 0, userId: "user-a", email: "member@example.test", session: { access_token: `${encode({})}.${encode({ aal })}.sig`, user: { id: "user-a", factors } } };
}
const verified = [{ id: "f1", factor_type: "totp", status: "verified", friendly_name: "Phone" }];
const show = () => render(<MemoryRouter><ResetPassword /></MemoryRouter>);

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  mocks.state = { phase: "ready", activeSlot: 0, accounts: [account("aal1")] };
  mocks.updateUser.mockResolvedValue({ data: {}, error: null });
  mocks.signOut.mockResolvedValue({ error: null });
});

it("refuses to set a password from a signed-in session without the emailed link", () => {
  show();
  expect(screen.getByText("This link doesn't work")).toBeTruthy();
  expect(screen.queryByLabelText(/New password/)).toBeNull();
  expect(mocks.updateUser).not.toHaveBeenCalled();
});

it("refuses a link that signed in another account", () => {
  markPasswordRecovery(0, "user-b");
  show();
  expect(screen.queryByLabelText(/New password/)).toBeNull();
});

it("asks for the authenticator before the password when the account has one", async () => {
  markPasswordRecovery(0, "user-a");
  mocks.state.accounts = [account("aal1", verified)];
  show();
  expect(screen.getByText("Confirm with your authenticator")).toBeTruthy();
  expect(screen.queryByLabelText(/New password/)).toBeNull();
  mocks.challengeAndVerify.mockResolvedValue({ data: null, error: new AuthError("Invalid TOTP code", 422, "mfa_verification_failed") });
  fireEvent.change(screen.getByPlaceholderText("000000"), { target: { value: "111111" } });
  fireEvent.click(screen.getByRole("button", { name: "Verify" }));
  await waitFor(() => expect(mocks.challengeAndVerify).toHaveBeenCalledWith({ factorId: "f1", code: "111111" }));
  await screen.findByText(/That code didn't work/);
  expect(mocks.completeSignIn).not.toHaveBeenCalled();
  expect(mocks.updateUser).not.toHaveBeenCalled();
});

it("saves the new password, signs out other sessions and closes the link", async () => {
  markPasswordRecovery(0, "user-a");
  show();
  fireEvent.change(screen.getByLabelText(/^New password/), { target: { value: "Velvet-Harbor-42" } });
  fireEvent.change(screen.getByLabelText(/Repeat new password/), { target: { value: "Velvet-Harbor-42" } });
  fireEvent.click(screen.getByRole("button", { name: "Save new password" }));
  await screen.findByText("Password updated");
  expect(mocks.updateUser).toHaveBeenCalledWith({ password: "Velvet-Harbor-42" });
  expect(mocks.signOut).toHaveBeenCalledWith({ scope: "others" });
  expect(sessionStorage.getItem("tf.auth.recovery.0")).toBeNull();
});

it("does not send mismatched or weak passwords", () => {
  markPasswordRecovery(0, "user-a");
  show();
  fireEvent.change(screen.getByLabelText(/^New password/), { target: { value: "Velvet-Harbor-42" } });
  fireEvent.change(screen.getByLabelText(/Repeat new password/), { target: { value: "Velvet-Harbor-43" } });
  fireEvent.click(screen.getByRole("button", { name: "Save new password" }));
  fireEvent.change(screen.getByLabelText(/^New password/), { target: { value: "password" } });
  fireEvent.change(screen.getByLabelText(/Repeat new password/), { target: { value: "password" } });
  fireEvent.click(screen.getByRole("button", { name: "Save new password" }));
  expect(mocks.updateUser).not.toHaveBeenCalled();
});

it("explains an expired or unknown link when nobody is signed in", () => {
  mocks.state = { phase: "ready", activeSlot: null, accounts: [] };
  show();
  expect(screen.getByText("This reset link has expired or was already used. Request a new one.")).toBeTruthy();
});
