import { useCallback } from "react";
import { useNavigate } from "react-router";
import { toast } from "@portable-ui/react";
import { useT } from "~/shared/i18n/AppLocale";
import { hasUnsavedWork } from "./dirty-guard";
import { loginPath } from "./returnTo";
import { useSessionManager, useSessionState } from "./SessionProvider";
import { userInitiatedSignOuts } from "./signout-tracker";
import type { SlotId } from "./storage-keys";

/**
 * Account switching, adding and signing out. Each action asks before discarding unsaved work;
 * the AccountScope remount then aborts old requests and clears per-account state.
 */
export function useAccountActions(confirmDiscard: () => Promise<boolean>) {
  const manager = useSessionManager();
  const state = useSessionState();
  const navigate = useNavigate();
  const m = useT();

  const guard = useCallback(
    async () => (hasUnsavedWork() ? confirmDiscard() : true),
    [confirmDiscard],
  );

  const switchTo = useCallback(
    async (slot: SlotId) => {
      if (slot === state.activeSlot || !(await guard())) return;
      manager.activate(slot);
      // Resource URLs belong to the previous account; start the new one from its dashboard.
      navigate("/app", { replace: true });
    },
    [guard, manager, navigate, state.activeSlot],
  );

  const addAccount = useCallback(async () => {
    const slot = manager.slotForNewSignIn();
    if (slot === null || !(await guard())) return;
    navigate(`${loginPath(undefined, slot)}&add=1`);
  }, [guard, manager, navigate]);

  const signOut = useCallback(
    async (slot: SlotId) => {
      const isActive = slot === state.activeSlot;
      if (isActive && !(await guard())) return;
      const account = state.accounts.find((a) => a.slot === slot);
      if (account) userInitiatedSignOuts.add(account.userId);
      await manager.signOut(slot);
      if (account?.email)
        toast({
          tone: "neutral",
          title: m.accounts.signedOutToast(account.email),
        });
      if (!isActive) return;
      // The manager has already made the next account active: continue there straight away.
      const next = manager.getState();
      const now = next.accounts.find((a) => a.slot === next.activeSlot);
      if (now?.email)
        toast({ tone: "neutral", title: m.accounts.switchedTo(now.email) });
      navigate(now ? "/app" : "/auth/login", { replace: true });
    },
    [guard, manager, navigate, state.accounts, state.activeSlot, m],
  );

  const signOutAll = useCallback(async () => {
    if (!(await guard())) return;
    for (const account of state.accounts) {
      userInitiatedSignOuts.add(account.userId);
      await manager.signOut(account.slot);
    }
    navigate("/auth/login", { replace: true });
  }, [guard, manager, navigate, state.accounts]);

  return {
    switchTo,
    addAccount,
    signOut,
    signOutAll,
    canAdd: manager.slotForNewSignIn() !== null,
  };
}
