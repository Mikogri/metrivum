import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AuthError } from "@supabase/supabase-js";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Login from "./login";
import Register from "./register";

const mocks = vi.hoisted(() => ({ signUp: vi.fn(), signInWithOtp: vi.fn(), signInWithPassword: vi.fn(), completeSignIn: vi.fn() }));
vi.mock("~/shared/session/supabase", () => ({ supabaseConfigured: () => true }));
vi.mock("~/shared/session/SessionProvider", () => ({
  useSessionManager: () => ({ slotForNewSignIn: () => 0, client: () => ({ auth: mocks }), completeSignIn: mocks.completeSignIn }),
  useSessionState: () => ({ phase: "ready", activeSlot: null, accounts: [] }),
}));

function Destination() {
  const location = useLocation();
  return <p>{location.pathname + location.search}</p>;
}
function setup(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/auth/login" element={<Login />} />
        <Route path="/auth/register" element={<Register />} />
        <Route path="*" element={<Destination />} />
      </Routes>
    </MemoryRouter>,
  );
}
const authError = (code: string, status = 422) => new AuthError("server text that must not be shown", status, code);

beforeEach(() => vi.clearAllMocks());

describe("forms that must not reveal whether an account exists", () => {
  it("continues to code entry when a passwordless sign-in names an unknown address", async () => {
    mocks.signInWithOtp.mockResolvedValue({ data: {}, error: authError("otp_disabled") });
    setup("/auth/login");
    await userEvent.click(screen.getByRole("button", { name: "Sign in with an email link instead" }));
    await userEvent.type(screen.getByLabelText(/^Email/), "  nobody@example.com ");
    await userEvent.click(screen.getByRole("button", { name: "Email me a sign-in link" }));
    expect(await screen.findByText(/^\/auth\/verify\?type=email/)).toHaveTextContent("email=nobody%40example.com");
    expect(mocks.signInWithOtp.mock.calls[0]![0].email).toBe("nobody@example.com");
  });

  it("still reports other passwordless failures", async () => {
    mocks.signInWithOtp.mockResolvedValue({ data: {}, error: authError("over_email_send_rate_limit", 429) });
    setup("/auth/login");
    await userEvent.click(screen.getByRole("button", { name: "Sign in with an email link instead" }));
    await userEvent.type(screen.getByLabelText(/^Email/), "someone@example.com");
    await userEvent.click(screen.getByRole("button", { name: "Email me a sign-in link" }));
    expect(await screen.findByRole("alert")).not.toHaveTextContent("server text");
    expect(screen.queryByText(/^\/auth\/verify/)).toBeNull();
  });

  it("treats sign-up for a registered address like a new one", async () => {
    mocks.signUp.mockResolvedValue({ data: { user: null, session: null }, error: authError("user_already_exists") });
    setup("/auth/register");
    await userEvent.type(screen.getByLabelText(/^Email/), "taken@example.com");
    await userEvent.type(screen.getByLabelText(/^Password/), "test-password-123");
    await userEvent.click(screen.getByRole("button", { name: "Create account" }));
    expect(await screen.findByText(/^\/auth\/verify\?type=signup/)).toBeInTheDocument();
    expect(mocks.completeSignIn).not.toHaveBeenCalled();
  });

  it("rejects malformed addresses and over-long passwords before calling Supabase", async () => {
    setup("/auth/register");
    await userEvent.type(screen.getByLabelText(/^Email/), "anna@example..com");
    await userEvent.type(screen.getByLabelText(/^Password/), "x".repeat(73));
    await userEvent.click(screen.getByRole("button", { name: "Create account" }));
    expect(await screen.findByText("Use at most 72 characters (fewer with emoji or accented letters).")).toBeInTheDocument();
    expect(mocks.signUp).not.toHaveBeenCalled();
  });
});
