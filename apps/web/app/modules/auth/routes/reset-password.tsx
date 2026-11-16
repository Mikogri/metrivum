import { useState, type FormEvent } from "react";
import { CircleCheck } from "lucide-react";
import {
  Alert,
  Button,
  EmptyState,
  ErrorState,
  LinkButton,
  TextField,
} from "@portable-ui/react";
import { BootScreen } from "~/modules/accounts";
import { useT } from "~/shared/i18n/AppLocale";
import {
  useSessionManager,
  useSessionState,
} from "~/shared/session/SessionProvider";
import { AuthHeader } from "../components/AuthHeader";
import { SecondFactorForm } from "../components/SecondFactorForm";
import form from "../components/form.module.css";
import { securityErrorCode } from "../lib/accountSecurity";
import {
  clearPasswordRecovery,
  hasPasswordRecovery,
  needsSecondFactor,
  verifiedTotp,
} from "../lib/assurance";
import { authErrorText, passwordProblem } from "../lib/authErrors";
import { privateMeta } from "~/shared/i18n/site";

export const meta = () => privateMeta("Set new password — Metrivum");

/**
 * The one place a new password is set: reached from the reset link for a forgotten password and from
 * Settings → Change password alike. It opens only for the account the link signed in, in the tab that opened it.
 */
export default function ResetPassword() {
  const m = useT();
  const t = m.auth.reset;
  const manager = useSessionManager();
  const state = useSessionState();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [done, setDone] = useState(false);

  if (state.phase === "loading") return <BootScreen />;
  const account = state.accounts.find((a) => a.slot === state.activeSlot);
  if (done) {
    return (
      <EmptyState
        icon={<CircleCheck />}
        title={t.doneTitle}
        description={t.doneBody}
        actions={
          <LinkButton href="/app/dashboard" variant="primary">
            {t.continue}
          </LinkButton>
        }
      />
    );
  }
  // The recovery link signs the user in through /auth/callback; without that the link was invalid, expired or opened elsewhere.
  if (!account || !hasPasswordRecovery(account.slot, account.userId)) {
    return (
      <ErrorState
        title={t.invalidTitle}
        description={account ? t.notFromLink : t.noSession}
        actions={
          account ? (
            <LinkButton
              href="/app/settings/security/change-password"
              variant="primary"
            >
              {m.accountSecurity.password.send}
            </LinkButton>
          ) : (
            <LinkButton href="/auth/forgot-password" variant="primary">
              {t.requestNew}
            </LinkButton>
          )
        }
      />
    );
  }
  const slot = account.slot;
  // A reset link proves the inbox, not the authenticator: accounts with one confirm it before choosing a password.
  if (needsSecondFactor(account.session)) {
    return (
      <>
        <AuthHeader
          title={m.accountSecurity.challenge.stepUpTitle}
          subtitle={m.accountSecurity.challenge.stepUpBody}
        />
        <SecondFactorForm
          slot={slot}
          factors={verifiedTotp(account.session.user)}
          onVerified={async (session) => {
            await manager.completeSignIn(slot, session);
          }}
        />
        <p className={form.note}>{m.accountSecurity.challenge.lost}</p>
      </>
    );
  }
  const weak = passwordProblem(m, password, account.email ?? undefined);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitted(true);
    if (weak || password !== confirm || pending) return;
    setPending(true);
    setError(null);
    try {
      const client = manager.client(slot);
      const { error: updateError } = await client.auth.updateUser({ password });
      if (updateError) throw updateError;
      clearPasswordRecovery(slot);
      // Whoever else held a session (a stolen one included) has to sign in with the new password.
      await client.auth.signOut({ scope: "others" }).catch(() => undefined);
      setDone(true);
    } catch (caught) {
      setError(
        securityErrorCode(caught) === "same_password"
          ? m.settings.security.samePassword
          : authErrorText(m, caught),
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <AuthHeader title={t.title} subtitle={account.email ?? undefined} />
      {error ? <Alert tone="danger" title={error} live="assertive" /> : null}
      <form className={form.form} onSubmit={onSubmit} noValidate>
        {/* The account's email for password managers, which pair the new password with it. */}
        <input
          type="email"
          name="username"
          autoComplete="username"
          value={account.email ?? ""}
          readOnly
          hidden
        />
        <TextField
          placeholder={m.common.ph.newPassword}
          label={t.newPassword}
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={setPassword}
          isRequired
          autoFocus
          description={m.auth.register.passwordHint}
          isInvalid={submitted && Boolean(weak)}
          errorMessage={weak ?? undefined}
        />
        <TextField
          placeholder={m.common.ph.confirmPassword}
          label={t.confirm}
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={setConfirm}
          isRequired
          isInvalid={submitted && confirm !== password}
          errorMessage={t.mismatch}
        />
        <Button type="submit" variant="primary" block loading={pending}>
          {t.submit}
        </Button>
      </form>
      <p className={form.note}>{m.accountSecurity.password.signedOutNote}</p>
    </>
  );
}
