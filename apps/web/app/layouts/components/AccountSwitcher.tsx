import {
  Check,
  ChevronsUpDown,
  ListChecks,
  LogOut,
  Plus,
  UserRound,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
  Button as AriaButton,
  MenuItem,
  MenuSection,
} from "react-aria-components";
import { useNavigate } from "react-router";
import {
  Avatar,
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuSection,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@metrivum/ui-web";
import {
  useAvatarUrl,
  useProfile,
  useProfileCompleteness,
} from "~/modules/accounts";
import { useT } from "~/shared/i18n/AppLocale";
import { useDiscardConfirm } from "~/shared/lib/useConfirm";
import {
  useActiveAccount,
  useSessionState,
} from "~/shared/session/SessionProvider";
import { SignOutDialog } from "~/shared/session/SignOutDialog";
import { useAccountActions } from "~/shared/session/useAccountActions";
import type { SlotId } from "~/shared/session/storage-keys";
import { SettingsIcon } from "./navIcons";
import styles from "./AccountSwitcher.module.css";

/** Name and username of each signed-in account, remembered in this browser while that account is active. */
type AccountHint = { name: string; username: string | null };
const hintKey = (userId: string) => `tf.account.hint.${userId}`;
function readHint(userId: string): AccountHint | null {
  try {
    const raw = window.localStorage.getItem(hintKey(userId));
    return raw ? (JSON.parse(raw) as AccountHint) : null;
  } catch {
    return null;
  }
}
function writeHint(userId: string, hint: AccountHint) {
  try {
    window.localStorage.setItem(hintKey(userId), JSON.stringify(hint));
  } catch {
    // Storage unavailable: other accounts then show their email.
  }
}

export function AccountSwitcher({ compact = false }: { compact?: boolean }) {
  const m = useT();
  const profile = useProfile();
  const active = useActiveAccount();
  const state = useSessionState();
  const navigate = useNavigate();
  const { confirm, dialog } = useDiscardConfirm();
  const actions = useAccountActions(confirm);
  const name = profile.displayName || profile.username || active?.email || "";
  // The second line names the account by its username; the email only stands in until a username exists.
  const handle = profile.username
    ? `@${profile.username}`
    : (active?.email ?? "");
  const [signingOut, setSigningOut] = useState(false);
  const activeUserId = active?.userId;
  useEffect(() => {
    if (activeUserId && name)
      writeHint(activeUserId, { name, username: profile.username ?? null });
  }, [activeUserId, name, profile.username]);
  const completeness = useProfileCompleteness();
  const photo = useAvatarUrl(profile.id, profile.hasAvatar);
  const next = completeness.items.find((item) => !item.done);

  return (
    <>
      <DropdownMenuTrigger>
        <AriaButton
          className={styles.trigger}
          data-compact={compact || undefined}
          aria-label={m.accounts.menuLabel(name)}
        >
          <Avatar
            name={name}
            size="md"
            decorative
            className={styles.avatar}
            src={photo}
          />
          {/* Kept in the DOM while the sidebar collapses so the text can fade instead of popping. */}
          <span className={styles.who} aria-hidden={compact || undefined}>
            <span className={styles.name}>{name}</span>
            <span className={styles.email}>{handle}</span>
          </span>
          <ChevronsUpDown aria-hidden="true" className={styles.chevron} />
        </AriaButton>
        <DropdownMenu
          placement="top start"
          className={styles.menu}
          onAction={(key) => {
            const id = String(key);
            if (id.startsWith("slot:"))
              void actions.switchTo(Number(id.slice(5)) as SlotId);
            else if (id === "add") void actions.addAccount();
            else if (id === "profile" || id === "profile-card")
              navigate("/app/profile");
            else if (id === "complete") navigate(next?.href ?? "/app/profile");
            else if (id === "settings") navigate("/app/settings");
            else if (id === "signout") setSigningOut(true);
          }}
        >
          {/* Who is signed in, as a card above the actions; choosing it opens the profile. */}
          <MenuSection className={styles.profileSection}>
            <MenuItem
              id="profile-card"
              textValue={`${name} ${m.accounts.viewProfile}`}
              className={styles.profile}
            >
              <span className={styles.profileRow}>
                <Avatar name={name} size="lg" decorative src={photo} />
                <span className={styles.profileText}>
                  <strong>{name}</strong>
                  <small>{handle}</small>
                </span>
              </span>
              {completeness.pending ? null : (
                <span
                  className={styles.progress}
                  data-complete={completeness.percent === 100 || undefined}
                >
                  <span className={styles.progressHead}>
                    <span>{m.accounts.profileComplete}</span>
                    <strong>{completeness.percent}%</strong>
                  </span>
                  <span
                    className={styles.progressBar}
                    role="meter"
                    aria-label={m.accounts.profileComplete}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={completeness.percent}
                  >
                    <span
                      style={{
                        transform: `scaleX(${completeness.percent / 100})`,
                      }}
                    />
                  </span>
                </span>
              )}
            </MenuItem>
          </MenuSection>
          {!completeness.pending && completeness.percent < 100 ? (
            <DropdownMenuItem
              id="complete"
              icon={<ListChecks />}
              description={m.accounts.stepsLeft(
                completeness.items.length - completeness.done,
              )}
            >
              {m.accounts.finishProfile}
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuSection title={m.accounts.signedIn}>
            {state.accounts.map((account) => {
              const current = account.slot === state.activeSlot;
              const hint = current
                ? { name, username: profile.username ?? null }
                : readHint(account.userId);
              const label = hint?.username
                ? `@${hint.username}`
                : hint?.name || account.email || "?";
              return (
                <DropdownMenuItem
                  key={`slot:${account.slot}`}
                  id={`slot:${account.slot}`}
                  textValue={label}
                  icon={
                    <Avatar
                      name={hint?.name || account.email || "?"}
                      size="sm"
                      decorative
                      className={styles.itemAvatar}
                      src={current ? photo : undefined}
                    />
                  }
                  description={account.email ?? undefined}
                >
                  <span className={styles.accountRow}>
                    <span className={styles.accountEmail}>{label}</span>
                    {current ? (
                      <Check
                        aria-label={m.accounts.current}
                        className={styles.current}
                      />
                    ) : null}
                  </span>
                </DropdownMenuItem>
              );
            })}
            <DropdownMenuItem
              id="add"
              icon={<Plus />}
              isDisabled={!actions.canAdd}
              description={actions.canAdd ? undefined : m.accounts.maxReached}
            >
              {m.accounts.add}
            </DropdownMenuItem>
          </DropdownMenuSection>
          <DropdownMenuSeparator />
          <DropdownMenuItem id="profile" icon={<UserRound />}>
            {m.accounts.viewProfile}
          </DropdownMenuItem>
          <DropdownMenuItem id="settings" icon={<SettingsIcon />}>
            {m.nav.settings}
          </DropdownMenuItem>
          <DropdownMenuItem id="signout" icon={<LogOut />} tone="danger">
            {m.accounts.signOut}…
          </DropdownMenuItem>
        </DropdownMenu>
      </DropdownMenuTrigger>
      <SignOutDialog
        isOpen={signingOut}
        onOpenChange={setSigningOut}
        signOut={actions.signOut}
        signOutAll={actions.signOutAll}
      />
      {dialog}
    </>
  );
}
