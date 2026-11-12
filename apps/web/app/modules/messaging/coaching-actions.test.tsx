import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { CoachingActions } from "./coaching-actions";
const state = vi.hoisted(() => ({ mode: "client", allowed: true }));
vi.mock("~/shared/session/WorkspaceScope", () => ({
  useWorkspace: () => ({ mode: state.mode }),
}));
vi.mock("~/shared/access", () => ({
  useFeatureAccess: () => ({ allowed: state.allowed }),
}));
it.each([
  ["client", true, false],
  ["coach", true, true],
  ["coach", false, false],
])(
  "gates chat coaching actions by workspace %s and permission %s",
  (mode, allowed, visible) => {
    state.mode = mode as string;
    state.allowed = allowed as boolean;
    render(
      <CoachingActions
        conversationId="chat"
        username="client"
        recipientId="user"
        disabled={false}
        onSent={() => {}}
      />,
    );
    expect(
      screen.queryByRole("button", { name: "More message options" }) !== null,
    ).toBe(visible);
  },
);
