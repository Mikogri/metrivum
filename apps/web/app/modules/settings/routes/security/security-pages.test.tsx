import { AuthError } from "@supabase/supabase-js";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ChangeEmail from "./change-email";
import ChangePassword from "./change-password";
import TwoFactor from "./two-factor";
import type * as Shared from "./shared";
import type * as Auth from "~/modules/auth";

const mocks = vi.hoisted(() => {
  const auth = {
    resetPasswordForEmail: vi.fn(),
    updateUser: vi.fn(),
    resend: vi.fn(),
    getSession: vi.fn(),
    mfa: { challengeAndVerify: vi.fn(), enroll: vi.fn(), unenroll: vi.fn() },
  };
  return {
    auth,
    verifyPassword: vi.fn(),
    sync: vi.fn(),
    user: {} as Record<string, unknown>,
  };
});
vi.mock("./shared", async (original) => ({
  ...(await original<typeof Shared>()),
  useSecurityAccount: () => ({
    account: { slot: 0, userId: "user-a", email: "member@example.test" },
    slot: 0,
    client: { auth: mocks.auth },
    user: mocks.user,
    lifecycle: { isCurrent: () => true },
    sync: mocks.sync,
  }),
}));
vi.mock("~/shared/session/SessionProvider", () => ({
  useSessionManager: () => ({
    client: () => ({ auth: mocks.auth }),
    getState: () => ({
      generation: 0,
      accounts: [{ slot: 0, userId: "user-a" }],
    }),
  }),
}));
vi.mock("~/modules/auth", async (original) => ({
  ...(await original<typeof Auth>()),
  verifyPassword: mocks.verifyPassword,
}));

const show = (page: ReactElement) =>
  render(<MemoryRouter>{page}</MemoryRouter>);
const verified = {
  id: "f1",
  factor_type: "totp",
  status: "verified",
  friendly_name: "Phone",
  created_at: "2026-10-01T00:00:00Z",
};
const codeError = new AuthError(
  "Invalid TOTP code",
  422,
  "mfa_verification_failed",
);

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mocks.user = {
    identities: [{ provider: "email" }],
    app_metadata: {},
    factors: [],
  };
  mocks.auth.resetPasswordForEmail.mockResolvedValue({ data: {}, error: null });
  mocks.auth.updateUser.mockResolvedValue({ data: { user: {} }, error: null });
  mocks.auth.getSession.mockResolvedValue({ data: { session: { user: {} } } });
  mocks.auth.mfa.unenroll.mockResolvedValue({ data: {}, error: null });
  mocks.verifyPassword.mockResolvedValue(true);
});

describe("change password", () => {
  it("only sends a reset link to the account's own address, then waits before another", async () => {
    show(<ChangePassword />);
    expect(document.querySelector('input[type="password"]')).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Send password reset link" }),
    );
    await screen.findByText("Check your inbox");
    expect(mocks.auth.resetPasswordForEmail).toHaveBeenCalledOnce();
    const [address, options] = mocks.auth.resetPasswordForEmail.mock.calls[0]!;
    expect(address).toBe("member@example.test");
    const redirect = new URL(options.redirectTo);
    expect(redirect.origin).toBe(window.location.origin);
    expect(redirect.pathname).toBe("/auth/callback");
    expect(redirect.searchParams.get("next")).toBe("/auth/reset-password");
    expect(redirect.searchParams.get("nonce")).toBeTruthy();
    expect(
      (
        screen.getByRole("button", {
          name: /Send again in/,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });
});

describe("change email", () => {
  function enterAddress(address = "next@example.test") {
    show(<ChangeEmail />);
    fireEvent.change(screen.getByLabelText(/^New email/), {
      target: { value: address },
    });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  }

  it("refuses the current address", () => {
    enterAddress("member@example.test");
    expect(screen.getByText("This is already your email.")).toBeTruthy();
    expect(screen.queryByLabelText(/Current password/)).toBeNull();
  });

  it("does not start the change with a wrong password", async () => {
    mocks.verifyPassword.mockResolvedValue(false);
    enterAddress();
    fireEvent.change(screen.getByLabelText(/Current password/), {
      target: { value: "wrong-password" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Send confirmation links" }),
    );
    await screen.findByText("The password is incorrect.");
    expect(mocks.auth.updateUser).not.toHaveBeenCalled();
  });

  it("starts Supabase's secure change after the password and shows it as pending", async () => {
    enterAddress();
    fireEvent.change(screen.getByLabelText(/Current password/), {
      target: { value: "right-password" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Send confirmation links" }),
    );
    await screen.findByText("Waiting for confirmation");
    expect(mocks.verifyPassword).toHaveBeenCalledWith(
      "member@example.test",
      "right-password",
      {},
    );
    const [attributes, options] = mocks.auth.updateUser.mock.calls[0]!;
    // Only the email is sent; the account keeps its id and nothing else changes.
    expect(attributes).toEqual({ email: "next@example.test" });
    expect(new URL(options.emailRedirectTo).searchParams.get("flow")).toBe(
      "email-change",
    );
  });

  it("with two-factor, needs a valid code as well and checks the password first", async () => {
    mocks.user = { ...mocks.user, factors: [verified] };
    mocks.auth.mfa.challengeAndVerify.mockResolvedValue({
      data: null,
      error: codeError,
    });
    enterAddress();
    fireEvent.change(screen.getByLabelText(/Current password/), {
      target: { value: "right-password" },
    });
    fireEvent.change(screen.getByPlaceholderText("000000"), {
      target: { value: "111111" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Send confirmation links" }),
    );
    await waitFor(() =>
      expect(mocks.auth.mfa.challengeAndVerify).toHaveBeenCalledOnce(),
    );
    expect(mocks.verifyPassword).toHaveBeenCalledOnce();
    expect(mocks.auth.updateUser).not.toHaveBeenCalled();
  });

  it("shows an open change and can send its links again", async () => {
    mocks.user = { ...mocks.user, new_email: "pending@example.test" };
    mocks.auth.resend.mockResolvedValue({ data: {}, error: null });
    show(<ChangeEmail />);
    expect(
      screen.getByText(
        /We sent a link to member@example.test and another to pending@example.test/,
      ),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Resend links" }));
    await waitFor(() =>
      expect(mocks.auth.resend).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "email_change",
          email: "pending@example.test",
        }),
      ),
    );
  });
});

describe("two-factor removal", () => {
  async function openRemoval() {
    mocks.user = { ...mocks.user, factors: [verified] };
    show(<TwoFactor />);
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    await screen.findByText("Remove Phone?");
  }

  it("keeps the authenticator when the password is wrong, without using the code", async () => {
    mocks.verifyPassword.mockResolvedValue(false);
    await openRemoval();
    fireEvent.change(screen.getByLabelText(/Current password/), {
      target: { value: "wrong-password" },
    });
    fireEvent.change(screen.getByPlaceholderText("000000"), {
      target: { value: "123456" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Remove authenticator" }),
    );
    await screen.findByText("The password is incorrect.");
    expect(mocks.auth.mfa.challengeAndVerify).not.toHaveBeenCalled();
    expect(mocks.auth.mfa.unenroll).not.toHaveBeenCalled();
  });

  it("keeps the authenticator when the code is wrong", async () => {
    mocks.auth.mfa.challengeAndVerify.mockResolvedValue({
      data: null,
      error: codeError,
    });
    await openRemoval();
    fireEvent.change(screen.getByLabelText(/Current password/), {
      target: { value: "right-password" },
    });
    fireEvent.change(screen.getByPlaceholderText("000000"), {
      target: { value: "111111" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Remove authenticator" }),
    );
    await waitFor(() =>
      expect(mocks.auth.mfa.challengeAndVerify).toHaveBeenCalledOnce(),
    );
    expect(mocks.auth.mfa.unenroll).not.toHaveBeenCalled();
  });

  it("removes it after the password and a fresh code", async () => {
    mocks.auth.mfa.challengeAndVerify.mockResolvedValue({
      data: {},
      error: null,
    });
    await openRemoval();
    expect(
      screen.getByText(/two-factor authentication turns off/),
    ).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/Current password/), {
      target: { value: "right-password" },
    });
    fireEvent.change(screen.getByPlaceholderText("000000"), {
      target: { value: "123456" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Remove authenticator" }),
    );
    await waitFor(() =>
      expect(mocks.auth.mfa.unenroll).toHaveBeenCalledWith({ factorId: "f1" }),
    );
    expect(mocks.sync).toHaveBeenCalled();
  });
});

describe("two-factor setup", () => {
  it("turns on only after Supabase accepts a code for the new factor", async () => {
    mocks.auth.mfa.enroll.mockResolvedValue({
      data: {
        id: "new",
        totp: {
          qr_code: "data:image/svg+xml;utf-8,<svg/>",
          secret: "ABCDEFGH",
          uri: "",
        },
      },
      error: null,
    });
    mocks.auth.mfa.challengeAndVerify
      .mockResolvedValueOnce({ data: null, error: codeError })
      .mockResolvedValueOnce({ data: {}, error: null });
    show(<TwoFactor />);
    fireEvent.click(
      screen.getByRole("button", { name: "Enable two-factor authentication" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByText("ABCD EFGH");
    expect(mocks.auth.mfa.enroll).toHaveBeenCalledWith({
      factorType: "totp",
      friendlyName: "Authenticator",
      issuer: "Metrivum",
    });
    fireEvent.change(screen.getByPlaceholderText("000000"), {
      target: { value: "111111" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Turn on" }));
    await screen.findByText(/That code didn't work/);
    expect(mocks.sync).not.toHaveBeenCalled();
    fireEvent.change(screen.getByPlaceholderText("000000"), {
      target: { value: "123456" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Turn on" }));
    await waitFor(() => expect(mocks.sync).toHaveBeenCalledOnce());
    expect(mocks.auth.mfa.challengeAndVerify).toHaveBeenLastCalledWith({
      factorId: "new",
      code: "123456",
    });
  });

  it("removes the unfinished factor when setup is cancelled", async () => {
    mocks.auth.mfa.enroll.mockResolvedValue({
      data: { id: "new", totp: { qr_code: "", secret: "ABCD", uri: "" } },
      error: null,
    });
    show(<TwoFactor />);
    fireEvent.click(
      screen.getByRole("button", { name: "Enable two-factor authentication" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByText("ABCD");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(mocks.auth.mfa.unenroll).toHaveBeenCalledWith({ factorId: "new" }),
    );
  });
});
