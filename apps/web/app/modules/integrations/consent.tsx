import { formatInterfaceText } from "~/shared/i18n/interface-format";
import { useT as useUiCopy } from "~/shared/i18n/AppLocale";
import { useState } from "react";
import { Ban, Bot, ShieldCheck } from "lucide-react";
import { useSearchParams } from "react-router";
import { Alert, Button, Skeleton } from "@metrivum/ui-web";
import { AuthHeader } from "~/modules/auth/components/AuthHeader";
import { BrandMark } from "~/shared/ui/BrandMark";
import { useAccountContext } from "~/shared/session/AccountScope";
import { privateMeta } from "~/shared/i18n/site";
import { useIntegrationMutation, useIntegrationQuery, type ConsentDetails } from "./api";
import { IntegrationError, PermissionChoices } from "./integrations";
import { useIntegrationCopy } from "./copy";
import styles from "./consent.module.css";

export const meta = () => privateMeta("Connect an AI assistant — Metrivum");

export function verifiedRedirect(redirectUrl: string, registeredUri: string) {
  const redirect = new URL(redirectUrl);
  const registered = new URL(registeredUri);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(registered.hostname);
  if ((registered.protocol !== "https:" && !(local && registered.protocol === "http:")) || redirect.origin !== registered.origin || redirect.pathname !== registered.pathname || redirect.username || redirect.password) throw new Error("The authorization server returned an invalid redirect. Reconnect from your assistant.");
  return redirect.href;
}

export default function Consent() {
  const [params] = useSearchParams();
  const id = params.get("authorization_id") ?? "";
  return <ConsentRequest key={id} authorizationId={id} />;
}

/** The assistant and Metrivum with a line of light running between them. */
function LinkVisual() {
  return <div className={styles.link} aria-hidden="true">
    <span className={styles.tile}><Bot /></span>
    <span className={styles.wire}><i /></span>
    <span className={styles.tile} data-brand><BrandMark /></span>
  </div>;
}

/** The assistant's OAuth request, shown in the sign-in card: who asks, where it returns, and which permissions to grant. */
function ConsentRequest({ authorizationId }: { authorizationId: string }) {
  const uiCopy = useUiCopy();
  const copy = useIntegrationCopy();
  const { account } = useAccountContext();
  const [selected, setSelected] = useState<string[]>([]);
  const [redirectError, setRedirectError] = useState<unknown>(null);
  const path = `/api/v1/me/ai-consent/${encodeURIComponent(authorizationId)}`;
  const query = useIntegrationQuery<ConsentDetails>(path, undefined, !!authorizationId);
  const save = useIntegrationMutation<{ redirectUrl: string }>(data => {
    try { window.location.assign(verifiedRedirect(data.redirectUrl, query.data!.redirectUri)); } catch (error) { setRedirectError(error); }
  });
  const signedIn = formatInterfaceText(uiCopy["ui"]["Signed in as {0}"], [account.email ?? "your Metrivum account"]);

  if (!authorizationId) return <>
    <LinkVisual />
    <AuthHeader title={copy.consentTitle} />
    <Alert tone="danger" title={uiCopy["ui"]["Missing authorization request. Start the connection from your assistant."]} />
  </>;
  if (query.isPending) return <>
    <LinkVisual />
    <AuthHeader title={copy.consentTitle} subtitle={signedIn} />
    <div className={styles.loading}><Skeleton height="4.5rem" /><Skeleton height="10rem" /><Skeleton height="2.5rem" /></div>
  </>;
  if (query.error) return <>
    <LinkVisual />
    <AuthHeader title={copy.consentTitle} subtitle={signedIn} />
    <IntegrationError error={query.error} />
    <Button variant="secondary" block onPress={() => void query.refetch()}>{uiCopy["ui"]["Retry authorization request"]}</Button>
  </>;

  const details = query.data;
  return <>
    <LinkVisual />
    <AuthHeader title={formatInterfaceText(uiCopy["ui"]["Connect {0}"], [details.clientName])} subtitle={signedIn} />
    <dl className={styles.details} aria-label={copy.requestDetails}>
      <div><dt>{copy.clientId}</dt><dd><code>{details.clientId}</code></dd></div>
      <div><dt>{uiCopy["ui"]["Registered callback"]}</dt><dd><code>{details.redirectUri}</code></dd></div>
      <div><dt>{uiCopy["ui"]["Identity scopes:"].replace(/:$/, "")}</dt><dd>{details.scopes.join(", ") || uiCopy["editor"]["panel"]["effortModes"]["none"]}</dd></div>
    </dl>
    <section className={styles.permissions} aria-labelledby="consent-permissions">
      <div className={styles.permissionsHead}>
        <h2 id="consent-permissions">{uiCopy["ui"]["Choose Metrivum permissions"]}</h2>
        <button type="button" className={styles.textButton} disabled={save.isPending || selected.length === details.availableGrants.length} onClick={() => setSelected(details.availableGrants)}>{copy.selectAll}</button>
      </div>
      <PermissionChoices available={details.availableGrants} selected={selected} onChange={setSelected} disabled={save.isPending} />
    </section>
    <ul className={styles.rules}>
      <li><ShieldCheck aria-hidden="true" />{copy.actions}</li>
      <li><Ban aria-hidden="true" />{copy.forbidden}</li>
    </ul>
    <p className={styles.note}>{uiCopy["ui"]["The assistant can see private content returned by these tools. Drafts stay private. Sending messages always requires your separate approval in Metrivum. You can change permissions or disconnect in Settings → Integrations."]}</p>
    <IntegrationError error={save.error ?? redirectError} />
    <div className={styles.actions}>
      <Button variant="secondary" isDisabled={save.isPending} onPress={() => save.mutate({ method: "POST", path: `${path}/deny` })}>{uiCopy["ui"]["Deny"]}</Button>
      <Button variant="primary" loading={save.isPending} isDisabled={!selected.length || save.isPending} onPress={() => save.mutate({ method: "POST", path, json: { grants: selected } })}>{uiCopy["ui"]["Allow selected permissions"]}</Button>
    </div>
    <p className={styles.count} aria-live="polite">{copy.selectedCount(selected.length, details.availableGrants.length)}</p>
  </>;
}
