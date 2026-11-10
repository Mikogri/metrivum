import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AuthError } from "@supabase/supabase-js";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Login from "./login";
import Register from "./register";

const mocks = vi.hoisted(() => ({
  generation: 0,
  signUp: vi.fn(),
  signInWithOtp: vi.fn(),
  signInWithPassword: vi.fn(),
  completeSignIn: vi.fn(),
}));
vi.mock("~/shared/session/supabase", () => ({
  supabaseConfigured: () => true,
}));
vi.mock("~/shared/session/SessionProvider", () => ({
  useSessionManager: () => ({
    slotForNewSignIn: () => 0,
    client: () => ({ auth: mocks }),
    completeSignIn: mocks.completeSignIn,
  }),
  useSessionState: () => ({
    phase: "ready",
    activeSlot: null,
    accounts: [],
    generation: mocks.generation,
  }),
}));

function Destination() {
  const location = useLocation();
  return <p>{location.pathname + location.search}</p>;
}
function AuthTree({ path }: { path: string }) {
  return (
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/auth/login" element={<Login />} />
        <Route path="/auth/register" element={<Register />} />
        <Route path="*" element={<Destination />} />
      </Routes>
    </MemoryRouter>
  );
}
function setup(path: string) {
  return render(<AuthTree path={path} />);
}
const authError = (code: string, status = 422) =>
  new AuthError("server text that must not be shown", status, code);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.generation = 0;
});

describe("account existence in the sign-in and sign-up forms", () => {
  it("ignores a successful delayed login after the account lifetime changes", async () => {
    let finish!: () => void;
    mocks.signInWithPassword.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = () =>
            resolve({
              data: { session: { user: { email: "pending@example.com" } } },
              error: null,
            });
        }),
    );
    const view = setup("/auth/login");
    await userEvent.type(
      screen.getByLabelText(/^Email/),
      "pending@example.com",
    );
    await userEvent.type(
      screen.getByLabelText(/^Password/),
      "test-password-123",
    );
    await userEvent.click(screen.getByRole("button", { name: /^Sign in$/ }));
    await waitFor(() =>
      expect(mocks.signInWithPassword).toHaveBeenCalledOnce(),
    );
    mocks.generation++;
    view.rerender(<AuthTree path="/auth/login" />);
    await act(async () => {
      finish();
    });
    expect(mocks.completeSignIn).not.toHaveBeenCalled();
    expect(screen.queryByText(/^\/app/)).toBeNull();
  });
  it("continues to code entry when a passwordless sign-in names an unknown address", async () => {
    mocks.signInWithOtp.mockResolvedValue({
      data: {},
      error: authError("otp_disabled"),
    });
    setup("/auth/login");
    await userEvent.click(
      screen.getByRole("button", {
        name: "Sign in with an email link instead",
      }),
    );
    await userEvent.type(
      screen.getByLabelText(/^Email/),
      "  nobody@example.com ",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Email me a sign-in link" }),
    );
    expect(
      await screen.findByText(/^\/auth\/verify\?type=email/),
    ).toHaveTextContent("email=nobody%40example.com");
    expect(mocks.signInWithOtp.mock.calls[0]![0].email).toBe(
      "nobody@example.com",
    );
  });

  it("keeps an unconfirmed password login on the confirmation step", async () => {
    mocks.signInWithPassword.mockResolvedValue({
      data: { session: { user: { email: "pending@example.com" } } },
      error: null,
    });
    mocks.completeSignIn.mockRejectedValueOnce(
      authError("email_not_confirmed", 403),
    );
    setup("/auth/login");
    await userEvent.type(
      screen.getByLabelText(/^Email/),
      "pending@example.com",
    );
    await userEvent.type(
      screen.getByLabelText(/^Password/),
      "test-password-123",
    );
    await userEvent.click(screen.getByRole("button", { name: /^Sign in$/ }));
    await waitFor(() =>
      expect(
        screen.getAllByRole("link").map((link) => link.getAttribute("href")),
      ).toContain(
        "/auth/verify?type=signup&slot=0&email=pending%40example.com",
      ),
    );
    expect(screen.queryByText(/^\/app/)).toBeNull();
  });

  it("still reports other passwordless failures", async () => {
    mocks.signInWithOtp.mockResolvedValue({
      data: {},
      error: authError("over_email_send_rate_limit", 429),
    });
    setup("/auth/login");
    await userEvent.click(
      screen.getByRole("button", {
        name: "Sign in with an email link instead",
      }),
    );
    await userEvent.type(
      screen.getByLabelText(/^Email/),
      "someone@example.com",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Email me a sign-in link" }),
    );
    expect(await screen.findByRole("alert")).not.toHaveTextContent(
      "server text",
    );
    expect(screen.queryByText(/^\/auth\/verify/)).toBeNull();
  });

  it("keeps an existing-account signup error indistinguishable from a fresh signup", async () => {
    mocks.signUp.mockResolvedValue({
      data: { user: null, session: null },
      error: authError("user_already_exists"),
    });
    setup("/auth/register");
    await userEvent.type(screen.getByLabelText(/^Email/), "taken@example.com");
    await userEvent.type(
      screen.getByLabelText(/^Password/),
      "test-password-123",
    );
    await userEvent.click(
      screen.getByRole("checkbox", { name: /I accept the/ }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Create account" }),
    );
    expect(
      await screen.findByText(/^\/auth\/verify\?type=signup/),
    ).toHaveTextContent("email=taken%40example.com");
    expect(screen.queryByText("This email already has an account.")).toBeNull();
    expect(
      screen.queryByRole("link", { name: "Sign in to this account instead" }),
    ).toBeNull();
    expect(mocks.completeSignIn).not.toHaveBeenCalled();
  });

  it("keeps an identities-free existing-account response on the generic confirmation flow", async () => {
    mocks.signUp.mockResolvedValue({
      data: { user: { id: "u1", identities: [] }, session: null },
      error: null,
    });
    setup("/auth/register");
    await userEvent.type(screen.getByLabelText(/^Email/), "taken@example.com");
    await userEvent.type(
      screen.getByLabelText(/^Password/),
      "test-password-123",
    );
    await userEvent.click(
      screen.getByRole("checkbox", { name: /I accept the/ }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Create account" }),
    );
    expect(
      await screen.findByText(/^\/auth\/verify\?type=signup/),
    ).toHaveTextContent("email=taken%40example.com");
    expect(screen.queryByText("This email already has an account.")).toBeNull();
  });

  it("rejects malformed addresses and over-long passwords before calling Supabase", async () => {
    setup("/auth/register");
    await userEvent.type(screen.getByLabelText(/^Email/), "anna@example..com");
    await userEvent.type(screen.getByLabelText(/^Password/), "x".repeat(73));
    await userEvent.click(
      screen.getByRole("checkbox", { name: /I accept the/ }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Create account" }),
    );
    expect(
      await screen.findByText(
        "Use at most 72 characters (fewer with emoji or accented letters).",
      ),
    ).toBeInTheDocument();
    expect(mocks.signUp).not.toHaveBeenCalled();
  });
});
