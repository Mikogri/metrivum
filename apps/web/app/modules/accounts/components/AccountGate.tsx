import { LogIn, RefreshCw } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router";
import { Button, ErrorState, LinkButton } from "@trainflow/ui-web";
import { ApiError } from "~/shared/http/errors";
import { useAppLocale, useT } from "~/shared/i18n/AppLocale";
import { errorText, traceIdOf } from "~/shared/lib/errorText";
import { AccountScope } from "~/shared/session/AccountScope";
import { loginPath, sanitizeReturnTo } from "~/shared/session/returnTo";
import { useSessionManager, useSessionState } from "~/shared/session/SessionProvider";
import { supabaseConfigured } from "~/shared/session/supabase";
import { BootScreen } from "./BootScreen";
import { ProfileContext, useProfileQuery } from "../api/useProfile";
import styles from "./AccountGate.module.css";

type Mode = "app" | "onboarding";

/**
 * Resolves session → account → profile before rendering private screens, so nothing private
 * flashes while the session is unknown. A failing /me is an error state, never an empty account.
 */
export function AccountGate({ mode, children }: { mode: Mode; children: ReactNode }) {
  const state = useSessionState();
  const location = useLocation();
  const m = useT();

  if (!supabaseConfigured()) {
    return (
      <div className={styles.center}>
        <ErrorState title={m.shell.notConfiguredTitle} description={m.shell.notConfiguredBody} />
      </div>
    );
  }
  if (state.phase === "loading") return <BootScreen />;
  const account = state.accounts.find((a) => a.slot === state.activeSlot);
  if (!account) {
    const returnTo = `${location.pathname}${location.search}`;
    return <Navigate to={loginPath(sanitizeReturnTo(returnTo))} replace />;
  }
  const key = `${account.slot}:${account.userId}:${state.generation}`;
  return (
    <AccountScope key={key} account={account} generation={state.generation}>
      <ProfileGate mode={mode}>{children}</ProfileGate>
    </AccountScope>
  );
}

function ProfileGate({ mode, children }: { mode: Mode; children: ReactNode }) {
  const query = useProfileQuery();
  const location = useLocation();
  const m = useT();
  const { setLocale } = useAppLocale();
  const manager = useSessionManager();
  const state = useSessionState();

  useEffect(() => {
    if (query.data?.locale) setLocale(query.data.locale);
  }, [query.data?.locale, setLocale]);

  if (query.isPending) return <BootScreen />;

  if (query.isError) {
    const error = query.error;
    if (error instanceof ApiError && error.status === 401) {
      return (
        <div className={styles.center}>
          <ErrorState
            title={m.shell.sessionExpiredTitle}
            description={m.shell.sessionExpiredBody}
            actions={
              <LinkButton variant="primary" iconStart={<LogIn />} href={loginPath(undefined, state.activeSlot ?? undefined)}>
                {m.shell.signInAgain}
              </LinkButton>
            }
          />
        </div>
      );
    }
    if (error instanceof ApiError && error.code === "ACCOUNT_DISABLED") {
      return (
        <div className={styles.center}>
          <ErrorState
            title={m.shell.restrictedTitle}
            description={m.shell.restrictedBody}
            actions={
              <Button variant="secondary" onPress={() => state.activeSlot !== null && void manager.signOut(state.activeSlot)}>
                {m.accounts.signOut}
              </Button>
            }
          />
        </div>
      );
    }
    return (
      <div className={styles.center}>
        <ErrorState
          title={m.shell.commErrorTitle}
          description={`${m.shell.commErrorBody} ${errorText(m, error)}`}
          reference={traceIdOf(error)}
          actions={
            <Button variant="primary" iconStart={<RefreshCw />} onPress={() => void query.refetch()} loading={query.isFetching}>
              {m.common.retry}
            </Button>
          }
        />
      </div>
    );
  }

  const profile = query.data;
  const params = new URLSearchParams(location.search);
  if (mode === "app" && !profile.onboarded) {
    return <Navigate to={`/onboarding?returnTo=${encodeURIComponent(`${location.pathname}${location.search}`)}`} replace />;
  }
  if (mode === "onboarding" && profile.onboarded) {
    return <Navigate to={sanitizeReturnTo(params.get("returnTo"))} replace />;
  }
  return <ProfileContext.Provider value={profile}>{children}</ProfileContext.Provider>;
}
