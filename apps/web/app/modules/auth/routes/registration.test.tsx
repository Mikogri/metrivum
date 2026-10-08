import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Register from "./register";
import Verify from "./verify";
import { sanitizeReturnTo } from "~/shared/session/returnTo";

const mocks = vi.hoisted(() => ({ signUp: vi.fn(), verifyOtp: vi.fn(), resend: vi.fn(), completeSignIn: vi.fn() }));
vi.mock("~/shared/session/supabase", () => ({ supabaseConfigured: () => true }));
vi.mock("~/shared/session/SessionProvider", () => ({
  useSessionManager: () => ({ slotForNewSignIn: () => 0, client: () => ({ auth: mocks }), completeSignIn: mocks.completeSignIn }),
}));
function Destination() { return <p>{useLocation().pathname + useLocation().search}</p>; }
function setup(path: string) {
  return render(<MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/auth/register" element={<Register />} />
    <Route path="/auth/verify" element={<Verify />} />
    <Route path="/onboarding" element={<Destination />} />
  </Routes></MemoryRouter>);
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.signUp.mockResolvedValue({ data: { session: null }, error: null });
  mocks.verifyOtp.mockResolvedValue({ data: { session: { user: { id: "test" } } }, error: null });
  mocks.resend.mockResolvedValue({ error: null });
});
describe("registration account choice", () => {
  it.each(["Coach", "Client"])("keeps %s through signup, resend and code confirmation", async (role) => {
    setup(`/auth/register?role=${role}`);
    expect(screen.getByRole("button", { name: /Account type/ })).toHaveTextContent(role);
    await userEvent.type(screen.getByLabelText(/^Email/), "account@example.com");
    await userEvent.type(screen.getByLabelText(/^Password/), "test-password-123");
    await userEvent.click(screen.getByRole("button", { name: "Create account" }));
    await screen.findByLabelText(/^Confirmation code/);
    const request = mocks.signUp.mock.calls[0]![0];
    const next = new URL(request.options.emailRedirectTo).searchParams.get("next");
    expect(sanitizeReturnTo(next)).toBe(`/onboarding?role=${role}`);
    expect(request.options.data).toBeUndefined();
    await userEvent.click(screen.getByRole("button", { name: "Send a new code" }));
    await waitFor(() => expect(mocks.resend).toHaveBeenCalledOnce());
    expect(new URL(mocks.resend.mock.calls[0]![0].options.emailRedirectTo).searchParams.get("next")).toBe(next);
    await userEvent.type(screen.getByLabelText(/^Confirmation code/), "123456");
    await userEvent.click(screen.getByRole("button", { name: "Confirm email" }));
    await screen.findByText(`/onboarding?role=${role}`);
    expect(mocks.completeSignIn).toHaveBeenCalledOnce();
  });
  it("lets a new user switch from Client to Coach", async () => {
    setup("/auth/register");
    const select = screen.getByRole("button", { name: /Account type/ });
    expect(select).toHaveTextContent("Client");
    await userEvent.click(select);
    await userEvent.click(screen.getByRole("option", { name: /Coach/ }));
    expect(select).toHaveTextContent("Coach");
  });
  it("keeps the choice when the environment returns an immediate session", async () => {
    mocks.signUp.mockResolvedValue({ data: { session: { user: { id: "test" } } }, error: null });
    setup("/auth/register?role=Coach");
    await userEvent.type(screen.getByLabelText(/^Email/), "account@example.com");
    await userEvent.type(screen.getByLabelText(/^Password/), "test-password-123");
    await userEvent.click(screen.getByRole("button", { name: "Create account" }));
    await screen.findByText("/onboarding?role=Coach");
  });
});
