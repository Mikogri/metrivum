import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { useNavigate } from "react-router";
import { PageHeader } from "@metrivum/ui-web";
import { useT } from "~/shared/i18n/AppLocale";
import { useAccountContext } from "~/shared/session/AccountScope";
import { useSessionManager } from "~/shared/session/SessionProvider";
import styles from "./security.module.css";

export const SECURITY_HOME = "/app/settings?section=security";

/**
 * The signed-in account with its Auth user read fresh from Supabase (factors, pending email, identities), falling
 * back to the stored session while that loads. `sync` refreshes the session after a change, so the account shown
 * everywhere (and the token the API receives) carries the new state.
 */
export function useSecurityAccount() {
  const { account, accountKey, lifecycle } = useAccountContext();
  const manager = useSessionManager();
  const cache = useQueryClient();
  const client = manager.client(account.slot);
  const key = [accountKey, "auth-user"];
  const query = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await client.auth.getUser();
      if (error) throw error;
      return data.user;
    },
    staleTime: 0,
  });
  async function sync() {
    const { data } = await client.auth.refreshSession();
    if (data.session && lifecycle.isCurrent())
      await manager.completeSignIn(account.slot, data.session);
    await cache.invalidateQueries({ queryKey: key });
  }
  return {
    account,
    slot: account.slot,
    client,
    user: query.data ?? account.session.user,
    loaded: query.isSuccess,
    lifecycle,
    sync,
  };
}

/** A security page: its own header with the way back to the overview, then the process in a narrow column. */
export function SecurityPage({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  const m = useT();
  const navigate = useNavigate();
  return (
    <>
      <PageHeader
        title={title}
        description={description}
        back={{
          label: m.accountSecurity.back,
          onPress: () => navigate(SECURITY_HOME),
        }}
      />
      <div className={styles.page}>{children}</div>
    </>
  );
}

/** Where the person is in a process: finished steps are ticked, the current one is highlighted. */
export function Steps({
  steps,
  current,
  label,
}: {
  steps: readonly string[];
  current: number;
  label: string;
}) {
  return (
    <ol className={styles.steps} aria-label={label}>
      {steps.map((step, index) => {
        const state =
          index < current ? "done" : index === current ? "current" : "todo";
        return (
          <li
            key={step}
            data-state={state}
            aria-current={state === "current" ? "step" : undefined}
          >
            <span className={styles.stepMark} aria-hidden="true">
              {state === "done" ? <Check /> : index + 1}
            </span>
            <span>{step}</span>
          </li>
        );
      })}
    </ol>
  );
}
