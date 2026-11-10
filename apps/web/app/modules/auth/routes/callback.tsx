import type { EmailOtpType, Session } from "@supabase/supabase-js";
import { useEffect, useRef, useState } from "react";
import { Link as RouterLink, useNavigate, useSearchParams } from "react-router";
import { ErrorState, LinkButton, toast } from "@metrivum/ui-web";
import { useT } from "~/shared/i18n/AppLocale";
import { sanitizeReturnTo } from "~/shared/session/returnTo";
import {
  useSessionManager,
  useSessionState,
} from "~/shared/session/SessionProvider";
import { SLOT_IDS, type SlotId } from "~/shared/session/storage-keys";
import { AuthWorking } from "../components/AuthWorking";
import { slotParam } from "../lib/urls";
import {
  consumeCallbackAttempt,
  readCallbackAttempt,
} from "../lib/callback-attempt";
import { markPasswordRecovery } from "../lib/assurance";
import styles from "./callback.module.css";
import { privateMeta } from "~/shared/i18n/site";

export const meta = () => privateMeta("Signing in — Metrivum");

const OTP_TYPES: EmailOtpType[] = [
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
];

/** Where a callback may continue: in-app pages plus the password reset form. */
function nextPath(value: string | null): string {
  if (value === "/auth/reset-password") return value;
  return sanitizeReturnTo(value, "/app/dashboard");
}

export default function AuthCallback() {
  const m = useT();
  const t = m.auth.callback;
  const [params] = useSearchParams();
  const manager = useSessionManager();
  const state = useSessionState();
  const navigate = useNavigate();
  const [failure, setFailure] = useState<"expired" | "failed" | null>(null);
  // Secure email change sends two links; the first one opened only says "now open the other one".
  const [halfway, setHalfway] = useState(false);
  const ran = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const currentParams = useRef(params.toString());
  currentParams.current = params.toString();

  useEffect(() => {
    // Codes are single-use: never exchange twice (StrictMode double effects, re-renders).
    if (state.phase !== "ready" || ran.current) return;
    ran.current = true;

    const errorCode = params.get("error_code") ?? params.get("error");
    if (errorCode) {
      setFailure(
        errorCode.includes("expired") || errorCode === "access_denied"
          ? "expired"
          : "failed",
      );
      return;
    }
    const requested = slotParam(params.get("slot"));
    if (
      requested === null ||
      !(SLOT_IDS as readonly number[]).includes(requested)
    ) {
      setFailure("failed");
      return;
    }
    const slot = requested as SlotId;
    const code = params.get("code");
    const tokenHash = params.get("token_hash");
    const type = params.get("type") as EmailOtpType | null;
    const generation = state.generation;
    const requestParams = params.toString();
    const current = () =>
      mounted.current &&
      manager.getState().generation === generation &&
      currentParams.current === requestParams;

    // Email change: not a sign-in. The link must confirm the account already signed in on this slot.
    if (params.get("flow") === "email-change") {
      const account = state.accounts.find((a) => a.slot === slot);
      const message =
        params.get("message") ??
        new URLSearchParams(window.location.hash.slice(1)).get("message");
      if (!account) {
        setFailure("failed");
        return;
      }
      let attempt;
      try {
        if (
          params.getAll("nonce").length !== 1 ||
          params.getAll("slot").length !== 1 ||
          (code && tokenHash)
        )
          throw new Error("Invalid link.");
        attempt = readCallbackAttempt(
          slot,
          params.get("nonce"),
          "email-change",
        );
        if (attempt.userId !== account.userId)
          throw new Error("Invalid account.");
      } catch {
        setFailure("failed");
        return;
      }
      const currentAccount = () =>
        current() &&
        manager
          .getState()
          .accounts.some((a) => a.slot === slot && a.userId === account.userId);
      if (!code && !tokenHash) {
        if (message) setHalfway(true);
        else setFailure("failed");
        return;
      }
      void (async () => {
        const client = manager.client(slot, currentAccount, {
          userId: account.userId,
        });
        try {
          let session: Session | null = null;
          if (code) {
            const { data, error } =
              await client.auth.exchangeCodeForSession(code);
            if (error) throw error;
            session = data.session;
          } else if (tokenHash) {
            const { data, error } = await client.auth.verifyOtp({
              token_hash: tokenHash,
              type: "email_change",
            });
            if (error) throw error;
            session = data.session;
          }
          if (!currentAccount()) {
            setFailure("failed");
            return;
          }
          if (!session) {
            setHalfway(true);
            return;
          }
          if (session.user.id !== account.userId)
            throw new Error("Invalid account for this link.");
          if (session.user.email?.toLowerCase() !== attempt.email) {
            setHalfway(true);
            return;
          }
          consumeCallbackAttempt(slot, params.get("nonce"), "email-change");
          await manager.completeSignIn(slot, session, currentAccount);
          toast({ tone: "success", title: t.emailChanged });
          navigate("/app/settings?section=security", { replace: true });
        } catch (error) {
          const text =
            error instanceof Error ? error.message.toLowerCase() : "";
          setFailure(
            text.includes("expired") || text.includes("invalid")
              ? "expired"
              : "failed",
          );
        } finally {
          await client.auth.dispose?.();
        }
      })();
      return;
    }

    void (async () => {
      let client: ReturnType<typeof manager.client> | undefined;
      try {
        if (
          params.getAll("nonce").length !== 1 ||
          params.getAll("slot").length !== 1 ||
          (code && tokenHash)
        )
          throw new Error("Invalid sign-in link.");
        const attempt = consumeCallbackAttempt(slot, params.get("nonce"));
        client = manager.client(slot, current, { email: attempt.email });
        let session: Session | null = null;
        if (code) {
          const { data, error } =
            await client.auth.exchangeCodeForSession(code);
          if (error) throw error;
          session = data.session;
        } else if (tokenHash && type && OTP_TYPES.includes(type)) {
          const { data, error } = await client.auth.verifyOtp({
            token_hash: tokenHash,
            type,
          });
          if (error) throw error;
          session = data.session;
        }
        if (!current()) {
          setFailure("failed");
          return;
        }
        if (!session) {
          setFailure("failed");
          return;
        }
        if (session.user.email?.trim().toLowerCase() !== attempt.email) {
          await client.auth.signOut({ scope: "local" });
          throw new Error("Invalid account for this sign-in link.");
        }
        const used = await manager.completeSignIn(slot, session, current);
        const next =
          type === "recovery"
            ? "/auth/reset-password"
            : nextPath(params.get("next"));
        // Only a reset link opened in this tab unlocks the new-password form.
        if (next === "/auth/reset-password")
          markPasswordRecovery(used, session.user.id);
        // Replace history so the one-time code never stays in the back stack.
        navigate(next, { replace: true });
      } catch (error) {
        const text = error instanceof Error ? error.message.toLowerCase() : "";
        setFailure(
          text.includes("expired") || text.includes("invalid")
            ? "expired"
            : "failed",
        );
      } finally {
        await client?.auth.dispose?.();
      }
    })();
  }, [
    state.phase,
    state.accounts,
    state.generation,
    params,
    manager,
    navigate,
    t.emailChanged,
  ]);

  if (halfway) {
    return (
      <ErrorState
        title={t.emailHalfwayTitle}
        description={t.emailHalfway}
        actions={
          <LinkButton href="/app/settings?section=security" variant="primary">
            {t.toSettings}
          </LinkButton>
        }
      />
    );
  }
  if (failure) {
    return (
      <ErrorState
        title={t.failedTitle}
        description={failure === "expired" ? t.expired : t.failed}
        actions={
          <LinkButton href="/auth/login" variant="primary">
            {t.backToLogin}
          </LinkButton>
        }
      />
    );
  }
  return (
    <div className={styles.working}>
      <AuthWorking title={t.working} steps={t.steps} />
      <RouterLink to="/auth/login" className="tf-visually-hidden">
        {t.backToLogin}
      </RouterLink>
    </div>
  );
}
