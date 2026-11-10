import type { Session } from "@supabase/supabase-js";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, expect, it, vi } from "vitest";
import SecondFactor from "./mfa";
import { SecondFactorForm } from "../components/SecondFactorForm";

const mocks = vi.hoisted(() => ({
  refreshSession: vi.fn(),
  completeSignIn: vi.fn(),
  challengeAndVerify: vi.fn(),
  getSession: vi.fn(),
  state: {
    phase: "ready",
    generation: 0,
    activeSlot: 0,
    accounts: [] as { slot: number; userId: string; session: Session }[],
  },
}));
vi.mock("~/shared/session/SessionProvider", () => ({
  useSessionState: () => mocks.state,
  useSessionManager: () => ({
    getState: () => mocks.state,
    client: () => ({
      auth: {
        refreshSession: mocks.refreshSession,
        getSession: mocks.getSession,
        mfa: { challengeAndVerify: mocks.challengeAndVerify },
      },
    }),
    completeSignIn: mocks.completeSignIn,
  }),
}));
vi.mock("~/modules/accounts", () => ({ BootScreen: () => <p>Loading</p> }));

beforeEach(() => {
  vi.clearAllMocks();
  const session = { refresh_token: "refresh-a", user: { id: "a" } } as Session;
  mocks.state = {
    phase: "ready",
    generation: 0,
    activeSlot: 0,
    accounts: [{ slot: 0, userId: "a", session }],
  };
  mocks.getSession.mockResolvedValue({ data: { session }, error: null });
});

it("does not reactivate the previous account when its initial MFA refresh finishes after switching", async () => {
  let finish!: (value: unknown) => void;
  mocks.refreshSession.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  render(
    <MemoryRouter initialEntries={["/auth/mfa?slot=0"]}>
      <SecondFactor />
    </MemoryRouter>,
  );
  await waitFor(() => expect(mocks.refreshSession).toHaveBeenCalledOnce());
  const session = mocks.state.accounts[0]!.session;
  mocks.state = { ...mocks.state, generation: 1, activeSlot: 1 };
  await act(async () => {
    finish({ data: { session }, error: null });
  });
  expect(mocks.completeSignIn).not.toHaveBeenCalled();
  expect(mocks.state.activeSlot).toBe(1);
});

it("does not call an MFA success handler after the account lifetime changes", async () => {
  let finish!: (value: unknown) => void;
  mocks.challengeAndVerify.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const onVerified = vi.fn();
  render(
    <SecondFactorForm
      slot={0}
      factors={[{ id: "factor" } as never]}
      onVerified={onVerified}
    />,
  );
  fireEvent.change(screen.getByPlaceholderText("000000"), {
    target: { value: "123456" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Verify" }));
  await waitFor(() => expect(mocks.challengeAndVerify).toHaveBeenCalledOnce());
  mocks.state = { ...mocks.state, generation: 1, activeSlot: 1 };
  await act(async () => {
    finish({ data: {}, error: null });
  });
  expect(onVerified).not.toHaveBeenCalled();
});
