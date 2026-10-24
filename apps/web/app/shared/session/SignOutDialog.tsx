import { LogOut } from "lucide-react";
import { useState } from "react";
import { Avatar, Badge, Button, Dialog } from "@trainflow/ui-web";
import { useT } from "~/shared/i18n/AppLocale";
import { useSessionState } from "./SessionProvider";
import type { SlotId } from "./storage-keys";
import styles from "./SignOutDialog.module.css";

/**
 * Sign-out always starts by choosing the account. The others stay signed in; signing out of the account in
 * use moves this tab to the next one at once (see useAccountActions.signOut).
 */
export function SignOutDialog({ isOpen, onOpenChange, signOut, signOutAll }: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  signOut: (slot: SlotId) => Promise<void>;
  signOutAll: () => Promise<void>;
}) {
  const m = useT();
  const state = useSessionState();
  const [pending, setPending] = useState<SlotId | "all" | null>(null);
  const run = async (target: SlotId | "all") => {
    setPending(target);
    try {
      // Close first: the account list (and possibly this whole screen) changes underneath.
      onOpenChange(false);
      await (target === "all" ? signOutAll() : signOut(target));
    } finally {
      setPending(null);
    }
  };
  // The account in use first, then the others in slot order.
  const accounts = [...state.accounts].sort((a, b) => Number(b.slot === state.activeSlot) - Number(a.slot === state.activeSlot) || a.slot - b.slot);
  return (
    <Dialog isOpen={isOpen} onOpenChange={onOpenChange} size="sm" title={m.accounts.signOutTitle} description={m.accounts.signOutChoose} closeLabel={m.common.close}>
      <ul className={styles.list}>
        {accounts.map((account) => (
          <li key={account.slot}>
            <button type="button" className={styles.row} disabled={pending !== null} onClick={() => void run(account.slot)} aria-label={m.accounts.signOutOf(account.email ?? "")}>
              <Avatar name={account.email ?? "?"} size="md" decorative />
              <span className={styles.email}>{account.email}</span>
              {account.slot === state.activeSlot ? <Badge tone="neutral">{m.accounts.using}</Badge> : null}
              <LogOut aria-hidden="true" className={styles.icon} />
            </button>
          </li>
        ))}
      </ul>
      <p className={styles.note}>{m.accounts.signOutBody}</p>
      {accounts.length > 1 ? (
        <div className={styles.footer}>
          <Button variant="danger-ghost" size="sm" iconStart={<LogOut />} isDisabled={pending !== null} onPress={() => void run("all")}>
            {m.accounts.signOutAll}
          </Button>
        </div>
      ) : null}
    </Dialog>
  );
}
