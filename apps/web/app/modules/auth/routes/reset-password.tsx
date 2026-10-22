import { useState, type FormEvent } from "react";
import { Link as RouterLink, useNavigate } from "react-router";
import { Alert, Button, TextField, toast } from "@trainflow/ui-web";
import { BootScreen } from "~/modules/accounts";
import { useT } from "~/shared/i18n/AppLocale";
import { useSessionManager, useSessionState } from "~/shared/session/SessionProvider";
import { AuthHeader } from "../components/AuthHeader";
import form from "../components/form.module.css";
import { authErrorText, passwordProblem } from "../lib/authErrors";
import { privateMeta } from "~/shared/i18n/site";

export const meta = () => privateMeta("Set new password — TrainFlow");

export default function ResetPassword() {
  const m = useT();
  const t = m.auth.reset;
  const manager = useSessionManager();
  const state = useSessionState();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  if (state.phase === "loading") return <BootScreen />;
  // The recovery link signs the user in through /auth/callback; without a session the link was invalid.
  if (state.activeSlot === null) {
    return (
      <>
        <AuthHeader title={t.title} />
        <Alert tone="warning" title={t.noSession} />
        <RouterLink to="/auth/forgot-password">{t.requestNew}</RouterLink>
      </>
    );
  }
  const slot = state.activeSlot;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitted(true);
    if (passwordProblem(m, password) || password !== confirm) return;
    setPending(true);
    setError(null);
    try {
      const { error: updateError } = await manager.client(slot).auth.updateUser({ password });
      if (updateError) throw updateError;
      toast({ tone: "success", title: t.done });
      navigate("/app/dashboard", { replace: true });
    } catch (caught) {
      setError(authErrorText(m, caught));
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <AuthHeader title={t.title} />
      {error ? <Alert tone="danger" title={error} live="assertive" /> : null}
      <form className={form.form} onSubmit={onSubmit} noValidate>
        <TextField placeholder={m.common.ph.newPassword}
          label={t.newPassword}
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={setPassword}
          isRequired
          description={m.auth.register.passwordHint}
          isInvalid={submitted && Boolean(passwordProblem(m, password))}
          errorMessage={passwordProblem(m, password) ?? undefined}
          size="lg"
        />
        <TextField placeholder={m.common.ph.confirmPassword}
          label={t.confirm}
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={setConfirm}
          isRequired
          isInvalid={submitted && confirm !== password}
          errorMessage={t.mismatch}
          size="lg"
        />
        <Button type="submit" variant="primary" size="lg" block loading={pending}>
          {t.submit}
        </Button>
      </form>
    </>
  );
}
