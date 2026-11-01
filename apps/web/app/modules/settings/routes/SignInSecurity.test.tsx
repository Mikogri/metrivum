import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { SignInSecurity } from "./SignInSecurity";

const mocks = vi.hoisted(() => ({ current: true, verify: vi.fn(), change: vi.fn(), client: vi.fn(() => ({ name: "original-slot-client" })) }));
vi.mock("~/shared/session/SessionProvider", () => ({
  useActiveAccount: () => ({ slot: 0, email: "demo@example.test", session: { user: { identities: [{ provider: "email" }] } } }),
  useSessionManager: () => ({ client: mocks.client }),
}));
vi.mock("~/shared/session/AccountScope", () => ({ useAccountContext: () => ({ lifecycle: { isCurrent: () => mocks.current } }) }));
vi.mock("~/modules/auth", () => ({
  verifyPassword: mocks.verify, changePassword: mocks.change, requestEmailChange: vi.fn(),
  isValidEmail: () => false, normalizeEmail: (s: string) => s, passwordProblem: () => null, securityErrorCode: () => null, authErrorText: () => "Failure",
}));
beforeEach(() => { mocks.current = true; mocks.verify.mockReset(); mocks.change.mockReset(); mocks.client.mockClear(); });

it.each([true, false])("binds password verification to the original account lifetime (retained: %s)", async retained => {
  let resolve!: (value: boolean) => void;
  mocks.verify.mockReturnValue(new Promise<boolean>(done => { resolve = done; }));
  render(<SignInSecurity />);
  fireEvent.change(screen.getByLabelText(/Current password/), { target: { value: "old-test-password" } });
  fireEvent.change(screen.getByLabelText(/^New password/), { target: { value: "new-test-password" } });
  fireEvent.change(screen.getByLabelText(/Repeat new password/), { target: { value: "new-test-password" } });
  fireEvent.click(screen.getByRole("button", { name: "Change password" }));
  await waitFor(() => expect(mocks.verify).toHaveBeenCalledOnce());
  expect(mocks.client).toHaveBeenCalledOnce();
  mocks.current = retained;
  await act(async () => resolve(true));
  if (retained) expect(mocks.change).toHaveBeenCalledWith(expect.objectContaining({ name: "original-slot-client" }), "old-test-password", "new-test-password");
  else expect(mocks.change).not.toHaveBeenCalled();
});
