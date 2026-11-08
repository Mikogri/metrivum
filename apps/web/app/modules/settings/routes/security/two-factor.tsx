import { useState, type FormEvent } from "react";
import type { Factor } from "@supabase/supabase-js";
import { Smartphone, Trash2 } from "lucide-react";
import { Alert, Badge, Button, Card, Dialog, List, ListRow, TextField, toast } from "@metrivum/ui-web";
import { CodeInput, SecondFactorForm, factorName, hasPassword, isSixDigitCode, mfaErrorText, verifiedTotp, verifyAuthenticatorCode, verifyPassword, useTurnstile } from "~/modules/auth";
import { formatDate } from "~/shared/i18n/format";
import { useAppLocale, useT } from "~/shared/i18n/AppLocale";
import { privateMeta } from "~/shared/i18n/site";
import { SecurityPage, Steps, useSecurityAccount } from "./shared";
import styles from "./security.module.css";

export const meta = () => privateMeta("Two-factor authentication — Metrivum");

type Enrollment = { id: string; qr: string; secret: string };

/**
 * Authenticator apps (TOTP) through Supabase Auth MFA: Supabase creates the secret and QR code and checks every
 * code; Metrivum never sees or stores the secret beyond showing it once during setup.
 */
export default function TwoFactor() {
  const m = useT();
  const t = m.accountSecurity.twoFactor;
  const { locale } = useAppLocale();
  const { account, slot, client, user, lifecycle, sync } = useSecurityAccount();
  const factors = verifiedTotp(user);
  const enabled = factors.length > 0;
  const [setup, setSetup] = useState<{ step: 0 | 1 | 2; name: string; enrollment: Enrollment | null } | null>(null);
  const [removing, setRemoving] = useState<Factor | null>(null);
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  function start() {
    const taken = new Set(factors.map((f) => factorName(f, t.defaultName)));
    let name = t.defaultName;
    for (let n = 2; taken.has(name); n++) name = `${t.defaultName} ${n}`;
    setSetup({ step: 0, name, enrollment: null });
    setError(null);
    setNote(null);
  }

  /** Setups abandoned earlier stay unverified in Auth; remove them so the new one can use the name. */
  async function dropUnverified() {
    for (const factor of user.factors ?? []) {
      if (factor.status === "unverified" && factor.factor_type === "totp") await client.auth.mfa.unenroll({ factorId: factor.id }).catch(() => undefined);
    }
  }

  async function enroll(event: FormEvent) {
    event.preventDefault();
    if (!setup || pending) return;
    const name = setup.name.trim() || t.defaultName;
    setPending(true);
    setError(null);
    try {
      await dropUnverified();
      const { data, error: enrollError } = await client.auth.mfa.enroll({ factorType: "totp", friendlyName: name, issuer: "Metrivum" });
      if (enrollError) throw enrollError;
      if (!lifecycle.isCurrent()) return;
      setSetup({ step: 1, name, enrollment: { id: data.id, qr: data.totp.qr_code, secret: data.totp.secret } });
    } catch (caught) {
      setError(mfaErrorText(m, caught));
    } finally {
      if (lifecycle.isCurrent()) setPending(false);
    }
  }

  async function cancel() {
    const id = setup?.enrollment?.id;
    setSetup(null);
    setCode("");
    setError(null);
    if (id) await client.auth.mfa.unenroll({ factorId: id }).catch(() => undefined);
  }

  async function confirm(event: FormEvent) {
    event.preventDefault();
    if (!setup?.enrollment || pending) return;
    if (!isSixDigitCode(code)) { setError(m.accountSecurity.errors.codeFormat); return; }
    setPending(true);
    setError(null);
    try {
      await verifyAuthenticatorCode(client, setup.enrollment.id, code);
      if (!lifecycle.isCurrent()) return;
      const first = !enabled;
      await sync();
      setSetup(null);
      setCode("");
      toast({ tone: "success", title: first ? t.enabledToast : t.addedToast });
      // Supabase signs out every other session once a factor is verified.
      setNote(first ? t.enabledNote : null);
    } catch (caught) {
      setError(mfaErrorText(m, caught));
      setCode("");
    } finally {
      if (lifecycle.isCurrent()) setPending(false);
    }
  }

  async function copySecret(secret: string) {
    try {
      await navigator.clipboard.writeText(secret);
      toast({ tone: "success", title: t.copied });
    } catch { /* The key stays visible to copy by hand. */ }
  }

  const step = setup?.step ?? 0;
  return (
    <SecurityPage title={t.title} description={t.description}>
      <Card as="section" padding="lg" className={styles.section} aria-labelledby="mfa-status">
        <div className={styles.actions}>
          <h2 id="mfa-status" className={styles.title}>{t.status}</h2>
          <Badge tone={enabled ? "success" : "neutral"} dot>{enabled ? m.accountSecurity.enabled : m.accountSecurity.disabled}</Badge>
        </div>
        {note ? <Alert tone="success" title={note} live="polite" /> : null}
        {enabled ? (
          <>
            <p className={styles.hint}>{t.factorsBody}</p>
            <List aria-label={t.factors}>
              {factors.map((factor) => (
                <ListRow
                  key={factor.id}
                  leading={<span className={styles.rowIcon}><Smartphone aria-hidden="true" /></span>}
                  title={factorName(factor, t.defaultName)}
                  subtitle={t.added(formatDate(locale, factor.created_at, { dateStyle: "medium" }))}
                  trailing={<Button size="sm" variant="danger-ghost" iconStart={<Trash2 />} onPress={() => setRemoving(factor)}>{t.remove}</Button>}
                />
              ))}
            </List>
            {factors.length === 1 && !setup ? <Alert tone="info" title={t.backupTip} /> : null}
          </>
        ) : null}
        {!setup ? (
          <div><Button variant={enabled ? "secondary" : "primary"} onPress={start}>{enabled ? t.addAnother : t.enable}</Button></div>
        ) : null}
      </Card>

      {setup ? (
        <Card as="section" padding="lg" className={styles.section} aria-labelledby="mfa-setup">
          <h2 id="mfa-setup" className={styles.title}>{t.setupTitle}</h2>
          <Steps steps={t.steps} current={step} label={t.setupTitle} />
          {error ? <Alert tone="danger" title={error} live="assertive" /> : null}
          {step === 0 ? (
            <form className={styles.section} onSubmit={enroll} noValidate>
              <TextField label={t.name} description={t.nameHint} value={setup.name} maxLength={40} autoFocus onChange={(name) => setSetup({ ...setup, name })} />
              <div className={styles.actions}>
                <Button type="submit" variant="primary" loading={pending}>{t.continue}</Button>
                <Button variant="ghost" onPress={() => void cancel()}>{t.cancel}</Button>
              </div>
            </form>
          ) : setup.enrollment ? (
            <form className={styles.section} onSubmit={confirm} noValidate>
              <p className={styles.hint}>{t.scan}</p>
              <div className={styles.qr}>
                <img src={setup.enrollment.qr} alt={t.qrAlt} />
                <div className={styles.secret}>
                  <p className={styles.quiet}>{t.cantScan}</p>
                  <code translate="no">{setup.enrollment.secret.match(/.{1,4}/g)?.join(" ")}</code>
                  <div><Button size="sm" variant="ghost" onPress={() => void copySecret(setup.enrollment!.secret)}>{t.copy}</Button></div>
                </div>
              </div>
              <CodeInput
                label={t.code}
                description={t.codeHint}
                value={code}
                onChange={(value) => { setCode(value); if (setup.step === 1 && value) setSetup({ ...setup, step: 2 }); setError(null); }}
              />
              <div className={styles.actions}>
                <Button type="submit" variant="primary" loading={pending}>{t.turnOn}</Button>
                <Button variant="ghost" isDisabled={pending} onPress={() => void cancel()}>{t.cancel}</Button>
              </div>
            </form>
          ) : null}
        </Card>
      ) : null}

      {removing ? (
        <RemoveFactor
          slot={slot}
          factor={removing}
          factors={factors}
          email={account.email ?? ""}
          passwordAccount={hasPassword(user)}
          onClose={() => setRemoving(null)}
          onRemoved={async (last) => {
            await sync();
            setRemoving(null);
            toast({ tone: "success", title: last ? t.turnedOff : t.removed });
          }}
        />
      ) : null}
    </SecurityPage>
  );
}

/**
 * Removing an authenticator needs a fresh code (Supabase also requires the second level for it) and, for accounts
 * with a password, the current password: a session left open on someone else's screen is not enough.
 */
function RemoveFactor({ slot, factor, factors, email, passwordAccount, onClose, onRemoved }: {
  slot: Parameters<typeof SecondFactorForm>[0]["slot"];
  factor: Factor;
  factors: Factor[];
  email: string;
  passwordAccount: boolean;
  onClose: () => void;
  onRemoved: (last: boolean) => Promise<void>;
}) {
  const m = useT();
  const t = m.accountSecurity.twoFactor;
  const { client, lifecycle } = useSecurityAccount();
  const [password, setPassword] = useState("");
  const last = factors.length === 1;
  const captcha = useTurnstile(`factor:${slot}:${factor.id}:${email}`);
  return (
    <Dialog isOpen onOpenChange={(open) => { if (!open) onClose(); }} title={t.removeTitle(factorName(factor, t.defaultName))} description={t.removeBody} closeLabel={m.common.close} size="sm">
      <div className={styles.section}>
        {passwordAccount ? captcha.widget : null}
        {last ? <Alert tone="warning" title={t.removeLast} /> : null}
        <SecondFactorForm
          slot={slot}
          factors={factors}
          submitLabel={t.confirmRemove}
          check={async () => {
            if (!passwordAccount) return null;
            if (!password) return m.accountSecurity.email.wrongPassword;
            const captchaOptions = captcha.take();
            if (!captchaOptions) return captcha.unavailable;
            return await verifyPassword(email, password, captchaOptions) ? null : m.accountSecurity.email.wrongPassword;
          }}
          onVerified={async () => {
            if (!lifecycle.isCurrent()) return captcha.unavailable;
            const { error } = await client.auth.mfa.unenroll({ factorId: factor.id });
            if (error) return mfaErrorText(m, error);
            await onRemoved(last);
          }}
        >
          {passwordAccount ? (
            <>
              <input type="email" name="username" autoComplete="username" value={email} readOnly hidden />
              <TextField label={t.removePassword} type="password" autoComplete="current-password" value={password} onChange={setPassword} isRequired autoFocus />
            </>
          ) : null}
        </SecondFactorForm>
      </div>
    </Dialog>
  );
}
