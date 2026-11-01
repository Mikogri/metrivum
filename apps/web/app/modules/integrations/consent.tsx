import { useState } from "react";
import { useSearchParams } from "react-router";
import { Alert, Button, Card, PageHeader, Skeleton } from "@metrivum/ui-web";
import { useAccountContext } from "~/shared/session/AccountScope";
import { privateMeta } from "~/shared/i18n/site";
import { useIntegrationMutation, useIntegrationQuery, type ConsentDetails } from "./api";
import { IntegrationError, PermissionChoices } from "./integrations";
import styles from "./integrations.module.css";

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
function ConsentRequest({ authorizationId }: { authorizationId: string }) {
  const { account } = useAccountContext();
  const [selected, setSelected] = useState<string[]>([]);
  const [redirectError, setRedirectError] = useState<unknown>(null);
  const path = `/api/v1/me/ai-consent/${encodeURIComponent(authorizationId)}`;
  const query = useIntegrationQuery<ConsentDetails>(path, undefined, !!authorizationId);
  const save = useIntegrationMutation<{ redirectUrl: string }>(data => {
    try { window.location.assign(verifiedRedirect(data.redirectUrl, query.data!.redirectUri)); } catch (error) { setRedirectError(error); }
  });
  return <div className={`${styles.stack} ${styles.page}`}>
    {!authorizationId ? <Alert tone="danger" title="Missing authorization request. Start the connection from your assistant." /> : query.isPending ? <Skeleton height="10rem" /> : query.error ? <><IntegrationError error={query.error} /><Button onPress={() => void query.refetch()}>Retry authorization request</Button></> : <>
      <PageHeader title={`Connect ${query.data.clientName}`} description={`Signed in as ${account.email ?? "your Metrivum account"}`} />
      <Card as="section" padding="lg" className={styles.card}>
        <p className={styles.identity}>Client ID: {query.data.clientId}</p>
        <p className={styles.hint}>Registered callback</p><p className={styles.identity}>{query.data.redirectUri}</p>
        <p className={styles.hint}>Identity scopes: {query.data.scopes.join(", ") || "None"}</p>
        <h2 className={styles.heading}>Choose Metrivum permissions</h2>
        <PermissionChoices available={query.data.availableGrants} selected={selected} onChange={setSelected} disabled={save.isPending} />
        <p className={styles.hint}>The assistant can see private content returned by these tools. Drafts stay private. Sending messages always requires your separate approval in Metrivum. You can change permissions or disconnect in Settings → Integrations.</p>
        <IntegrationError error={save.error ?? redirectError} />
        <div className={styles.actions}><Button variant="primary" isDisabled={!selected.length || save.isPending} onPress={() => save.mutate({ method: "POST", path, json: { grants: selected } })}>Allow selected permissions</Button><Button isDisabled={save.isPending} onPress={() => save.mutate({ method: "POST", path: `${path}/deny` })}>Deny</Button></div>
      </Card>
    </>}
  </div>;
}
