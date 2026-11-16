import { useEffect, useRef, useState } from "react";
import { Alert, Button, Spinner } from "@portable-ui/react";
import { useAppLocale } from "~/shared/i18n/AppLocale";
import { turnstileConfig } from "../lib/turnstile-config";
import { turnstileCopy } from "../lib/turnstile-copy";
import styles from "./Turnstile.module.css";

type WidgetOptions = {
  sitekey: string;
  theme: "dark";
  appearance: "interaction-only";
  size: "flexible";
  language: string;
  "response-field": false;
  retry: "never";
  "refresh-expired": "manual";
  callback: (token: string) => void;
  "error-callback": () => void;
  "expired-callback": () => void;
  "timeout-callback": () => void;
};
export interface TurnstileApi {
  render: (element: HTMLElement, options: WidgetOptions) => string;
  reset: (id: string) => void;
  remove: (id: string) => void;
}
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}
let loading: Promise<TurnstileApi> | undefined;
function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (loading) return loading;
  loading = new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement("script");
    const fail = () => {
      clearTimeout(timer);
      script.remove();
      loading = undefined;
      reject(new Error("Security verification unavailable"));
    };
    const timer = window.setTimeout(fail, 15000);
    script.src =
      "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.onerror = fail;
    script.onload = () => {
      if (!window.turnstile) {
        fail();
        return;
      }
      clearTimeout(timer);
      resolve(window.turnstile);
    };
    document.head.append(script);
  });
  return loading;
}

/** Tokens stay in component memory, belong to one form/account context and are consumed once. */
export function useTurnstile(scope: string) {
  const { locale } = useAppLocale();
  const copy = turnstileCopy[locale];
  const config = turnstileConfig();
  const [version, setVersion] = useState(0);
  const [status, setStatus] = useState<
    "waiting" | "ready" | "failed" | "expired"
  >("waiting");
  const container = useRef<HTMLDivElement>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const currentScope = useRef(scope);
  currentScope.current = scope;
  const challenge = useRef<{
    scope: string;
    token: string;
    expires: number;
    reset: () => void;
  } | null>(null);

  useEffect(() => {
    if (!config.required || !config.valid || !container.current) return;
    let live = true;
    let widget: string | undefined;
    let api: TurnstileApi | undefined;
    let expiry: ReturnType<typeof setTimeout> | undefined;
    const clear = (next: "failed" | "expired" | "waiting") => {
      clearTimeout(expiry);
      challenge.current = null;
      if (live && currentScope.current === scope) setStatus(next);
    };
    clear("waiting");
    void loadTurnstile()
      .then((loaded) => {
        if (!live || currentScope.current !== scope || !container.current)
          return;
        api = loaded;
        widget = api.render(container.current, {
          sitekey: config.siteKey,
          theme: "dark",
          appearance: "interaction-only",
          size: "flexible",
          language: locale,
          "response-field": false,
          retry: "never",
          "refresh-expired": "manual",
          callback: (token) => {
            if (!live || currentScope.current !== scope || !token) return;
            clearTimeout(expiry);
            challenge.current = {
              scope,
              token,
              expires: Date.now() + 290000,
              reset: () => {
                clear("waiting");
                if (widget !== undefined) api?.reset(widget);
              },
            };
            setStatus("ready");
            expiry = setTimeout(() => clear("expired"), 290000);
          },
          "error-callback": () => {
            if (live && currentScope.current === scope) clear("failed");
          },
          "expired-callback": () => {
            if (live && currentScope.current === scope) clear("expired");
          },
          "timeout-callback": () => {
            if (live && currentScope.current === scope) clear("expired");
          },
        });
        if (widget === undefined) clear("failed");
      })
      .catch(() => {
        if (live && currentScope.current === scope) clear("failed");
      });
    return () => {
      live = false;
      clearTimeout(expiry);
      challenge.current = null;
      if (widget !== undefined) api?.remove(widget);
    };
  }, [scope, locale, version, config.required, config.valid, config.siteKey]);

  function take(): { captchaToken?: string } | null {
    if (!config.required) return {};
    const value = challenge.current;
    if (
      !config.valid ||
      !value ||
      value.scope !== scope ||
      value.expires <= Date.now()
    )
      return null;
    const captchaToken = value.token;
    // Invalidate synchronously before any Auth network call; retries always need a new token.
    value.reset();
    return { captchaToken };
  }
  const ready =
    !config.required ||
    (config.valid && status === "ready" && challenge.current?.scope === scope);
  const widget = config.required ? (
    <div aria-label={copy.label}>
      <div ref={container} />
      {!config.valid ? (
        <Alert tone="danger" title={copy.unavailable} live="assertive" />
      ) : status === "failed" || status === "expired" ? (
        <>
          <Alert
            tone="danger"
            title={status === "expired" ? copy.expired : copy.failed}
            live="assertive"
          />
          <Button
            variant="ghost"
            size="sm"
            onPress={() => setVersion((value) => value + 1)}
          >
            {copy.retry}
          </Button>
        </>
      ) : null}
      {config.valid ? (
        <div
          className={styles.waiting}
          data-show={status === "waiting" || undefined}
          aria-hidden={status !== "waiting"}
        >
          <div className={styles.clip}>
            <p
              role={status === "waiting" ? "status" : undefined}
              className={styles.line}
            >
              <Spinner size="sm" />
              {copy.waiting}
            </p>
          </div>
        </div>
      ) : null}
    </div>
  ) : null;
  return {
    ready,
    take,
    widget,
    unavailable: copy.unavailable,
    isCurrent: () => mounted.current && currentScope.current === scope,
  };
}
