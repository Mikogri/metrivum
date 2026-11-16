import { ArrowUpRight, LogOut } from "lucide-react";
import { useState } from "react";
import {
  Button as AriaButton,
  Header,
  MenuSection,
} from "react-aria-components";
import {
  Avatar,
  Badge,
  Dialog,
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@portable-ui/react";
import {
  forgetSlot,
  storedAccountsHint,
  type SlotId,
  type StoredAccountHint,
} from "~/shared/session/storage-keys";
import { usePublicMessages } from "../messages";
import styles from "./PublicAccountMenu.module.css";

/** Signs one slot out without loading the app: the Supabase client is fetched only when needed. */
async function signOutSlot(slot: SlotId) {
  try {
    const { authClient } = await import("~/shared/session/supabase");
    // "local" revokes this browser's session for that account on the server; other accounts are untouched.
    await authClient(slot).auth.signOut({ scope: "local" });
  } catch {
    // Offline or already expired: the stored session is still removed below.
  } finally {
    forgetSlot(slot);
  }
}

/**
 * The signed-in person on the public site: who it is, a way into the app, and sign-out that first asks which
 * account (the others stay signed in, and the app then opens the next one).
 */
export function PublicAccountMenu({ onChange }: { onChange: () => void }) {
  const m = usePublicMessages();
  const [accounts, setAccounts] = useState<StoredAccountHint[]>(() =>
    storedAccountsHint(),
  );
  const [choosing, setChoosing] = useState(false);
  const [pending, setPending] = useState<SlotId | null>(null);
  const active = accounts.find((a) => a.active) ?? accounts[0];
  if (!active) return null;

  const signOut = async (slot: SlotId) => {
    setPending(slot);
    await signOutSlot(slot);
    setPending(null);
    setChoosing(false);
    const left = storedAccountsHint();
    setAccounts(left);
    if (!left.length) onChange();
  };

  return (
    <>
      <DropdownMenuTrigger>
        <AriaButton
          className={styles.trigger}
          aria-label={m.nav.accountMenu(active.email)}
        >
          <Avatar name={active.email || "?"} size="md" decorative />
        </AriaButton>
        <DropdownMenu
          placement="bottom end"
          className={styles.menu}
          onAction={(key) => {
            if (key === "open") window.location.assign("/app");
            else if (key === "signout") setChoosing(true);
          }}
        >
          <MenuSection className={styles.profileSection}>
            <Header className={styles.profile}>
              <Avatar name={active.email || "?"} size="lg" decorative />
              <span className={styles.profileText}>
                <strong>{active.email}</strong>
              </span>
            </Header>
          </MenuSection>
          <DropdownMenuItem id="open" icon={<ArrowUpRight />}>
            {m.nav.openApp}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem id="signout" icon={<LogOut />} tone="danger">
            {m.nav.signOut}…
          </DropdownMenuItem>
        </DropdownMenu>
      </DropdownMenuTrigger>
      <Dialog
        isOpen={choosing}
        onOpenChange={setChoosing}
        size="sm"
        title={m.nav.signOutTitle}
        description={m.nav.signOutChoose}
        closeLabel={m.nav.cancel}
      >
        <ul className={styles.list}>
          {accounts.map((account) => (
            <li key={account.slot}>
              <button
                type="button"
                className={styles.row}
                disabled={pending !== null}
                onClick={() => void signOut(account.slot)}
                aria-label={m.nav.signOutOf(account.email)}
              >
                <Avatar name={account.email || "?"} size="md" decorative />
                <span className={styles.email}>{account.email}</span>
                {account.active ? (
                  <Badge tone="neutral">{m.nav.inUse}</Badge>
                ) : null}
                <LogOut aria-hidden="true" className={styles.icon} />
              </button>
            </li>
          ))}
        </ul>
      </Dialog>
    </>
  );
}
