import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { beforeEach, expect, it, vi } from "vitest";
import { AccountGate } from "./AccountGate";

const encode = (value: object) => btoa(JSON.stringify(value)).replace(/=+$/, "");
const mocks = vi.hoisted(() => ({ state: { phase: "ready", activeSlot: 0, generation: 1, accounts: [] as unknown[] } }));
vi.mock("~/shared/session/SessionProvider", () => ({ useSessionState: () => mocks.state, useSessionManager: () => ({}) }));
vi.mock("~/shared/session/supabase", () => ({ supabaseConfigured: () => true }));
// Reaching the scope means the gate let private screens load.
vi.mock("~/shared/session/AccountScope", () => ({ AccountScope: () => <p>Private workspace</p> }));

function account(aal: string, factorStatus?: string) {
  return { slot: 0, userId: "user-a", email: "member@example.test", session: { access_token: `${encode({})}.${encode({ aal })}.sig`, user: { id: "user-a", factors: factorStatus ? [{ id: "f1", factor_type: "totp", status: factorStatus }] : [] } } };
}
function Where() {
  const location = useLocation();
  return <p>{`${location.pathname}${location.search}`}</p>;
}
const show = () => render(
  <MemoryRouter initialEntries={["/app/clients?tab=active"]}>
    <Routes>
      <Route path="/app/clients" element={<AccountGate mode="app"><p>Clients</p></AccountGate>} />
      <Route path="/auth/mfa" element={<Where />} />
    </Routes>
  </MemoryRouter>,
);

beforeEach(() => { mocks.state = { phase: "ready", activeSlot: 0, generation: 1, accounts: [] }; });

it("sends a first-level session of an account with an authenticator to the second step, keeping the destination", () => {
  mocks.state.accounts = [account("aal1", "verified")];
  show();
  expect(screen.getByText(`/auth/mfa?slot=0&returnTo=${encodeURIComponent("/app/clients?tab=active")}`)).toBeTruthy();
  expect(screen.queryByText("Private workspace")).toBeNull();
});

it("lets a second-level session in", () => {
  mocks.state.accounts = [account("aal2", "verified")];
  show();
  expect(screen.getByText("Private workspace")).toBeTruthy();
});

it("does not ask for a code while the only setup is unfinished", () => {
  mocks.state.accounts = [account("aal1", "unverified")];
  show();
  expect(screen.getByText("Private workspace")).toBeTruthy();
});
