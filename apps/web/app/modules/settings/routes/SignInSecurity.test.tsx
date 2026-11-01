import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, expect, it, vi } from "vitest";
import { SignInSecurity } from "./SignInSecurity";

const mocks = vi.hoisted(() => ({ roles: ["Coach"], user: {} as Record<string, unknown> }));
vi.mock("~/modules/accounts", () => ({ useProfile: () => ({ roles: mocks.roles }) }));
vi.mock("./security/shared", () => ({ useSecurityAccount: () => ({ account: { email: "coach@example.test" }, user: mocks.user }) }));
const show = () => render(<MemoryRouter><SignInSecurity /></MemoryRouter>);
const verified = { id: "f1", factor_type: "totp", status: "verified" };

beforeEach(() => {
  mocks.roles = ["Coach"];
  mocks.user = { identities: [{ provider: "email" }], app_metadata: {}, factors: [] };
});

it("shows status and links only: no password, email or code fields", () => {
  show();
  expect(screen.queryAllByRole("textbox")).toHaveLength(0);
  expect(document.querySelector('input[type="password"]')).toBeNull();
  expect(screen.getByRole("link", { name: "Change email" }).getAttribute("href")).toBe("/app/settings/security/change-email");
  expect(screen.getByRole("link", { name: "Change password" }).getAttribute("href")).toBe("/app/settings/security/change-password");
  expect(screen.getByRole("link", { name: "Manage" }).getAttribute("href")).toBe("/app/settings/security/two-factor");
  expect(screen.getByRole("link", { name: "View" }).getAttribute("href")).toBe("/app/settings/security/recovery");
  expect(screen.getByText("coach@example.test")).toBeTruthy();
});

it("recommends two-factor to coaches while it is off", () => {
  show();
  expect(screen.getByText("Turn on two-factor authentication")).toBeTruthy();
  expect(screen.getByText(/client accounts and payments/)).toBeTruthy();
  expect(screen.getByText("Disabled")).toBeTruthy();
});

it("shows two-factor as enabled and drops the recommendation", () => {
  mocks.user = { ...mocks.user, factors: [verified, { ...verified, id: "f2", status: "unverified" }] };
  show();
  expect(screen.queryByText("Turn on two-factor authentication")).toBeNull();
  expect(screen.getByText("Enabled")).toBeTruthy();
  expect(screen.getByText(/^1 authenticator app\./)).toBeTruthy();
});

it("shows a pending email change and offers to set a password on code-only accounts", () => {
  mocks.user = { identities: [], app_metadata: {}, factors: [], new_email: "next@example.test" };
  show();
  expect(screen.getByText("Change to next@example.test is waiting for confirmation")).toBeTruthy();
  expect(screen.getByRole("link", { name: "Set password" })).toBeTruthy();
});
