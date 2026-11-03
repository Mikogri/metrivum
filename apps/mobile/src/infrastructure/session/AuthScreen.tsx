import { useI18n as useNativeCopy } from "../i18n";
import { useEffect, useRef, useState } from "react";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { BrandMark } from "../../BrandMark";
import { Button, ErrorState, Field, ListItem, Screen, Section, SegmentedControl, SelectField, Switch, Text } from "@metrivum/ui-mobile";
import { useI18n } from "../i18n";
import { authErrorKey, passwordProblem } from "./auth-policy";
import { isValidEmail } from "./email";
import type { createEmailCodeFlow, EmailChallenge } from "./email-code";

type Flow = ReturnType<typeof createEmailCodeFlow>;
function useAlive() {
    const alive = useRef(true);
    useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
    return alive;
}
export function AuthScreen({ accounts, auth, requestCode, requestRecovery, onSignedIn, onCancel }: {
    accounts: { slot: number; session: Session }[];
    auth: (slot: number) => SupabaseClient["auth"];
    requestCode: Flow["request"];
    requestRecovery: (email: string) => Promise<void>;
    onSignedIn: (slot: number, session?: Session) => Promise<void>;
    onCancel?: () => void;
}) {
 const nativeCopy = useNativeCopy().t;

    const { t, locale, setLocale } = useI18n();
    const [mode, setMode] = useState<"login" | "register" | "forgot">("login");
    const [codeMode, setCodeMode] = useState(false);
    const [role, setRole] = useState<"Coach" | "Client">("Client");
    const [email, setEmail] = useState(""), [password, setPassword] = useState("");
    const [accepted, setAccepted] = useState(false), [submitted, setSubmitted] = useState(false);
    const [busy, setBusy] = useState(false), [error, setError] = useState<unknown>();
    const lock = useRef(false), alive = useAlive();
    const slot = [0, 1, 2].find(value => !accounts.some(item => item.slot === value));
    const registering = mode === "register";
    const emailError = submitted && !isValidEmail(email) ? t("auth.emailInvalid") : undefined;
    const pwProblem = registering ? passwordProblem(password, email) : null;
    async function submit() {
        if (lock.current || slot === undefined) return;
        setSubmitted(true);
        if (!isValidEmail(email) || (registering && (!accepted || pwProblem)) || (mode === "login" && !codeMode && !password)) return;
        lock.current = true; setBusy(true); setError(undefined);
        try {
            if (mode === "forgot") await requestRecovery(email);
            else if (registering) await requestCode(slot, email, "signup", { password, role, accepted });
            else if (codeMode) await requestCode(slot, email, "email");
            else {
                const result = await auth(slot).signInWithPassword({ email: email.trim(), password });
                if (result.error) throw result.error;
                if (!result.data.session) throw new Error("No session");
                if (alive.current) await onSignedIn(slot, result.data.session);
                else await auth(slot).signOut({ scope: "local" });
            }
        } catch (failure) { if (alive.current) setError(failure); }
        finally { lock.current = false; if (alive.current) setBusy(false); }
    }
    function changeMode(next: "login" | "register" | "forgot") {
        setMode(next); setSubmitted(false); setError(undefined); setPassword("");
    }
    return <Screen title={t(mode === "forgot" ? "auth.forgotTitle" : onCancel ? "auth.addTitle" : registering ? "auth.create" : "auth.signIn")} subtitle="Metrivum" headerAction={<BrandMark />}>
        {mode !== "forgot" && <SegmentedControl label={t("auth.addTitle")} value={mode} disabled={busy}
            options={[{ value: "login", label: t("auth.signIn") }, { value: "register", label: t("auth.create") }]} onChange={changeMode} />}
        {!!accounts.length && <Section>{accounts.map(item => <ListItem key={item.slot} icon="person" title={item.session.user.email ?? t("auth.account")}
            onPress={busy ? undefined : () => { void onSignedIn(item.slot).catch(setError); }} />)}</Section>}
        {slot === undefined ? <Text>{t("auth.maxAccounts")}</Text> : <Section flat>
            {registering && <SelectField label={t("auth.accountType")} value={role} disabled={busy} onChange={setRole}
                options={[{ value: "Client", label: t("role.client") }, { value: "Coach", label: t("role.coach") }]} />}
            <Field label={t("auth.email")} keyboardType="email-address" autoCapitalize="none" autoComplete="email" editable={!busy} value={email} onChangeText={value => { setEmail(value); setError(undefined); }} error={emailError} />
            {(registering || (mode === "login" && !codeMode)) && <Field label={t("auth.password")} secureTextEntry autoComplete={registering ? "new-password" : "current-password"} editable={!busy}
                value={password} onChangeText={value => { setPassword(value); setError(undefined); }} error={submitted && pwProblem ? t(pwProblem) : undefined} />}
            {registering && <>
                <Text tone="mutedText" variant="caption">{t("auth.passwordHint")}</Text>
                <ListItem title={t("onboarding.terms")} trailing={<Switch accessibilityLabel={t("onboarding.acceptTerms")} value={accepted} disabled={busy} onValueChange={setAccepted} />} />
                {submitted && !accepted && <Text tone="danger">{t("auth.termsRequired")}</Text>}
            </>}
            {!!error && <ErrorState error={new Error(t(authErrorKey(error)))} />}
            {((error as { code?: string })?.code === "email_not_confirmed") && <Button title={t("auth.verifyCode")} disabled={busy} onPress={async () => {
                if (lock.current) return;
                lock.current = true; setBusy(true);
                try { await requestCode(slot, email, "email"); } catch (failure) { if (alive.current) setError(failure); }
                finally { lock.current = false; if (alive.current) setBusy(false); }
            }} />}
            <Button size="lg" tone="primary" title={t(mode === "forgot" || (mode === "login" && codeMode) ? "auth.sendCode" : registering ? "auth.create" : "auth.signIn")} loading={busy} onPress={submit} />
            {mode === "login" && <>
                <Button tone="ghost" title={t(codeMode ? "auth.usePassword" : "auth.useCode")} disabled={busy} onPress={() => { setCodeMode(!codeMode); setSubmitted(false); setError(undefined); setPassword(""); }} />
                <Button tone="ghost" title={t("auth.forgot")} disabled={busy} onPress={() => changeMode("forgot")} />
            </>}
            {mode === "forgot" && <Button tone="ghost" title={t("auth.back")} disabled={busy} onPress={() => changeMode("login")} />}
        </Section>}
        <SegmentedControl label={nativeCopy("interface.Language / Język")} value={locale} disabled={busy} options={[{ value: "en", label: "English" }, { value: "pl", label: "Polski" }]}
            onChange={async value => { try { await setLocale(value); } catch (failure) { setError(failure); } }} />
        {onCancel && <Button title={t("common.cancel")} disabled={busy} onPress={onCancel} />}
    </Screen>;
}

export function EmailCodeScreen({ challenge, flow }: { challenge: EmailChallenge; flow: Flow }) {
    const { t } = useI18n();
    const [code, setCode] = useState(""), [error, setError] = useState<unknown>();
    const [busy, setBusy] = useState<"verify" | "resend" | null>(null), [now, setNow] = useState(Date.now());
    const lock = useRef(false), alive = useAlive();
    useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
    const wait = Math.max(0, Math.ceil((challenge.resendAt - now) / 1000));
    async function run(action: "verify" | "resend") {
        if (lock.current) return;
        lock.current = true; setBusy(action); setError(undefined);
        try { if (action === "verify") await flow.verify(code); else { await flow.resend(); if (alive.current) setCode(""); } }
        catch (failure) { if (alive.current) setError(failure); }
        finally { lock.current = false; if (alive.current) setBusy(null); }
    }
    return <Screen title={t(challenge.type === "recovery" ? "auth.forgotTitle" : "auth.verifyCode")} subtitle={t("auth.codeBody", { email: challenge.email })} headerAction={<BrandMark />}>
        <Field label={t("auth.code")} value={code} autoFocus keyboardType="number-pad" autoComplete="one-time-code" textContentType="oneTimeCode" maxLength={10}
            editable={!busy} onChangeText={value => { setCode(value.replace(/[^\d\s]/g, "")); setError(undefined); }} />
        <Text tone="mutedText">{t("auth.spam")}</Text>
        {!!error && <ErrorState error={new Error(t(authErrorKey(error)))} />}
        <Button tone="primary" title={t("common.continue")} loading={busy === "verify"} disabled={busy === "resend"} onPress={() => run("verify")} />
        <Button tone="ghost" title={wait ? t("auth.resendIn", { seconds: wait }) : t("auth.resend")} loading={busy === "resend"} disabled={!!busy || wait > 0} onPress={() => run("resend")} />
        <Button tone="ghost" title={t("auth.wrongEmail")} disabled={!!busy} onPress={() => flow.cancel()} />
    </Screen>;
}
