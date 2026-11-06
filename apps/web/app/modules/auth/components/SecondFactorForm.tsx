import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import type { Factor, Session } from "@supabase/supabase-js";
import { Alert, Button, Option, Select, TextField } from "@metrivum/ui-web";
import { useT } from "~/shared/i18n/AppLocale";
import { useSessionManager } from "~/shared/session/SessionProvider";
import type { SlotId } from "~/shared/session/storage-keys";
import { isSixDigitCode, mfaErrorText, verifyAuthenticatorCode } from "../lib/assurance";
import form from "./form.module.css";

/** Name shown for an authenticator; Supabase leaves it empty when none was given. */
export function factorName(factor: Factor, fallback: string): string {
  return factor.friendly_name?.trim() || fallback;
}

/**
 * A code from one of the account's authenticator apps, checked by Supabase Auth (a new challenge each time, so it
 * also confirms a session that is already at the second level). `onVerified` gets the upgraded session.
 */
export function SecondFactorForm({ slot, factors, check, onVerified, submitLabel, children, block = true }: {
  slot: SlotId;
  factors: Factor[];
  /** Runs before the code is used (for example the current password); a returned text stops and is shown. */
  check?: () => Promise<string | null | void>;
  /** Runs after the code passed; a returned text is shown as the form's error (for example a wrong password). */
  onVerified: (session: Session) => Promise<string | void> | string | void;
  submitLabel?: string;
  /** Fields shown before the code, such as the current password; checked by the caller in `onVerified`. */
  children?: ReactNode;
  block?: boolean;
}) {
  const m = useT();
  const t = m.accountSecurity;
  const manager = useSessionManager();
  const [factorId, setFactorId] = useState(factors[0]?.id ?? "");
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    if (!isSixDigitCode(code)) { setError(t.errors.codeFormat); return; }
    const state = manager.getState();
    const account = state.accounts.find(a => a.slot === slot);
    if (!account) return;
    const current = () => mounted.current && manager.getState().generation === state.generation
      && manager.getState().accounts.some(a => a.slot === slot && a.userId === account.userId);
    setPending(true);
    setError(null);
    setFormError(null);
    let client: ReturnType<typeof manager.client> | undefined;
    try {
      const refused = await check?.();
      if (!current()) return;
      if (refused) { setFormError(refused); return; }
      client = manager.client(slot, current, { userId: account.userId });
      const session = await verifyAuthenticatorCode(client, factorId, code);
      if (!current()) return;
      const problem = await onVerified(session);
      if (current() && problem) { setFormError(problem); setCode(""); }
    } catch (caught) {
      if (!current()) return;
      setError(mfaErrorText(m, caught));
      setCode("");
    } finally {
      await client?.auth.dispose?.();
      if (current()) setPending(false);
    }
  }

  return (
    <form className={form.form} onSubmit={onSubmit} noValidate>
      {formError ? <Alert tone="danger" title={formError} live="assertive" /> : null}
      {children}
      {factors.length > 1 ? (
        <Select label={t.challenge.factor} selectedKey={factorId} onSelectionChange={(key) => setFactorId(String(key))}>
          {factors.map((factor) => <Option key={factor.id} id={factor.id}>{factorName(factor, t.twoFactor.defaultName)}</Option>)}
        </Select>
      ) : null}
      <TextField
        label={t.challenge.code}
        placeholder="000000"
        className={form.code}
        inputMode="numeric"
        autoComplete="one-time-code"
        autoFocus={!children}
        value={code}
        onChange={(value) => { setCode(value.replace(/\D/g, "").slice(0, 6)); setError(null); }}
        isRequired
        isInvalid={Boolean(error)}
        errorMessage={error ?? undefined}
      />
      <div>
        <Button type="submit" variant="primary" block={block} loading={pending}>{submitLabel ?? t.challenge.verify}</Button>
      </div>
    </form>
  );
}
