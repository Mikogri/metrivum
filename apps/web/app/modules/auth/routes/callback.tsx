import type { EmailOtpType, Session } from "@supabase/supabase-js";
import { useEffect, useRef, useState } from "react";
import { Link as RouterLink, useNavigate, useSearchParams } from "react-router";
import { ErrorState, LinkButton, Spinner } from "@trainflow/ui-web";
import { useT } from "~/shared/i18n/AppLocale";
import { sanitizeReturnTo } from "~/shared/session/returnTo";
import { useSessionManager, useSessionState } from "~/shared/session/SessionProvider";
import { SLOT_IDS, type SlotId } from "~/shared/session/storage-keys";
import { AuthHeader } from "../components/AuthHeader";
import { slotParam } from "../lib/urls";
import styles from "./callback.module.css";
import { privateMeta } from "~/shared/i18n/site";

export const meta = () => privateMeta("Signing in — TrainFlow");

const OTP_TYPES: EmailOtpType[] = ["signup", "invite", "magiclink", "recovery", "email_change", "email"];

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
  const ran = useRef(false);

  useEffect(() => {
    // Codes are single-use: never exchange twice (StrictMode double effects, re-renders).
    if (state.phase !== "ready" || ran.current) return;
    ran.current = true;

    const errorCode = params.get("error_code") ?? params.get("error");
    if (errorCode) {
      setFailure(errorCode.includes("expired") || errorCode === "access_denied" ? "expired" : "failed");
      return;
    }
    const requested = slotParam(params.get("slot"));
    if (requested === null || !(SLOT_IDS as readonly number[]).includes(requested)) {
      setFailure("failed");
      return;
    }
    const slot = requested as SlotId;
    const client = manager.client(slot);
    const code = params.get("code");
    const tokenHash = params.get("token_hash");
    const type = params.get("type") as EmailOtpType | null;

    void (async () => {
      try {
        let session: Session | null = null;
        if (code) {
          const { data, error } = await client.auth.exchangeCodeForSession(code);
          if (error) throw error;
          session = data.session;
        } else if (tokenHash && type && OTP_TYPES.includes(type)) {
          const { data, error } = await client.auth.verifyOtp({ token_hash: tokenHash, type });
          if (error) throw error;
          session = data.session;
        }
        if (!session) {
          setFailure("failed");
          return;
        }
        await manager.completeSignIn(slot, session);
        const next = type === "recovery" ? "/auth/reset-password" : nextPath(params.get("next"));
        // Replace history so the one-time code never stays in the back stack.
        navigate(next, { replace: true });
      } catch (error) {
        const text = error instanceof Error ? error.message.toLowerCase() : "";
        setFailure(text.includes("expired") || text.includes("invalid") ? "expired" : "failed");
      }
    })();
  }, [state.phase, params, manager, navigate]);

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
    <div className={styles.working} role="status">
      <Spinner size="lg" tone="accent" />
      <AuthHeader title={t.working} />
      <RouterLink to="/auth/login" className="tf-visually-hidden">
        {t.backToLogin}
      </RouterLink>
    </div>
  );
}
