import { useEffect, useRef, useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router";
import { BootScreen } from "~/modules/accounts";
import { useT } from "~/shared/i18n/AppLocale";
import { privateMeta } from "~/shared/i18n/site";
import { sanitizeReturnTo } from "~/shared/session/returnTo";
import { useSessionManager, useSessionState } from "~/shared/session/SessionProvider";
import { AuthFooter, AuthHeader } from "../components/AuthHeader";
import { SecondFactorForm } from "../components/SecondFactorForm";
import form from "../components/form.module.css";
import { needsSecondFactor, verifiedTotp } from "../lib/assurance";
import { slotParam } from "../lib/urls";

export const meta = () => privateMeta("Two-factor authentication — Metrivum");

/**
 * The second step of signing in. Any sign-in (password, email code, link) lands here through the account gate
 * when the account has an authenticator and the session is still at the first level.
 */
export default function SecondFactor() {
  const m = useT();
  const t = m.accountSecurity.challenge;
  const [params] = useSearchParams();
  const state = useSessionState();
  const manager = useSessionManager();
  const navigate = useNavigate();
  const slot = slotParam(params.get("slot")) ?? state.activeSlot;
  const account = state.accounts.find((a) => a.slot === slot);
  const returnTo = sanitizeReturnTo(params.get("returnTo"));
  // Read the account's factors and level from Auth once, not only from the stored session.
  const [freshFor, setFreshFor] = useState<string | null>(null);
  const started = useRef<string | null>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const accountSlot = account?.slot ?? null;
  const refreshKey = `${state.generation}:${accountSlot}:${account?.userId}`;
  useEffect(() => {
    if (state.phase !== "ready" || accountSlot === null || !account || started.current === refreshKey) return;
    started.current = refreshKey;
    const current = () => mounted.current && manager.getState().generation === state.generation
      && manager.getState().accounts.some(a => a.slot === accountSlot && a.userId === account.userId);
    const client = manager.client(accountSlot, current, { userId: account.userId });
    void client.auth.refreshSession({ refresh_token: account.session.refresh_token })
      .then(async ({ data }) => { if (current() && data.session) await manager.completeSignIn(accountSlot, data.session, current); })
      .catch(() => undefined)
      .finally(async () => { await client.auth.dispose?.(); if (current()) setFreshFor(refreshKey); });
  }, [state.phase, state.generation, accountSlot, account, refreshKey, manager]);

  if (state.phase === "loading" || (account && freshFor !== refreshKey)) return <BootScreen />;
  if (!account) return <Navigate to="/auth/login" replace />;
  if (!needsSecondFactor(account.session)) return <Navigate to={returnTo} replace />;

  return (
    <>
      <AuthHeader title={t.title} subtitle={t.subtitle} />
      {account.email ? <p className={form.note}>{t.signedInAs(account.email)}</p> : null}
      <SecondFactorForm slot={account.slot} factors={verifiedTotp(account.session.user)} onVerified={async (session) => { await manager.completeSignIn(account.slot, session); }} />
      <p className={form.note}>{t.lost}</p>
      <AuthFooter>
        <button type="button" className={form.textButton} onClick={() => void manager.signOut(account.slot).then(() => navigate("/auth/login", { replace: true }))}>
          {t.signOut}
        </button>
      </AuthFooter>
    </>
  );
}
