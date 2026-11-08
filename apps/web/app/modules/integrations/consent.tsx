import { formatInterfaceText } from "~/shared/i18n/interface-format";
import { useT as useUiCopy } from "~/shared/i18n/AppLocale";
import { useState } from "react";
import { Bot, Check, ChevronDown } from "lucide-react";
import { Button as AriaButton, DialogTrigger, Header, ListBox, ListBoxItem, ListBoxSection, type Selection } from "react-aria-components";
import { useSearchParams } from "react-router";
import { Alert, AlertDialog, Button, Popover, Skeleton } from "@metrivum/ui-web";
import { AuthHeader } from "~/modules/auth";
import { BrandMark } from "~/shared/ui/BrandMark";
import { useAccountContext } from "~/shared/session/AccountScope";
import { privateMeta } from "~/shared/i18n/site";
import { useIntegrationMutation, useIntegrationQuery, type ConsentDetails } from "./api";
import { IntegrationError } from "./integrations";
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

/** One field that opens a checklist of permissions, grouped into read access and actions. */
function PermissionSelect({ available, selected, onChange, disabled }: { available: string[]; selected: string[]; onChange: (value: string[]) => void; disabled: boolean }) {
  const copy = useIntegrationCopy();
  const groups = [
    { id: "read", title: copy.read, grants: available.filter(grant => grant.startsWith("read_")) },
    { id: "write", title: copy.write, grants: available.filter(grant => !grant.startsWith("read_")) },
  ].filter(group => group.grants.length);
  const summary = !selected.length ? copy.noPermissions : selected.length === available.length ? copy.allPermissions(available.length) : copy.somePermissions(selected.length, available.length);
  const change = (keys: Selection) => onChange(keys === "all" ? available : available.filter(grant => keys.has(grant)));
  return <div className={styles.field}>
    <span className={styles.fieldLabel} id="consent-permissions">{copy.permissionsLabel}</span>
    <DialogTrigger>
      <AriaButton className={styles.trigger} isDisabled={disabled} aria-labelledby="consent-permissions consent-permissions-value">
        <span id="consent-permissions-value" className={styles.triggerValue} data-empty={!selected.length || undefined}>{summary}</span>
        <ChevronDown aria-hidden="true" className={styles.triggerChevron} />
      </AriaButton>
      <Popover width="trigger" placement="bottom" aria-label={copy.permissionsLabel} className={styles.menu}>
        <div className={styles.menuHead}>
          <button type="button" className={styles.textButton} disabled={selected.length === available.length} onClick={() => onChange(available)}>{copy.selectAll}</button>
          <button type="button" className={styles.textButton} disabled={!selected.length} onClick={() => onChange([])}>{copy.clearAll}</button>
        </div>
        <ListBox aria-label={copy.permissionsLabel} selectionMode="multiple" escapeKeyBehavior="none" selectedKeys={selected} onSelectionChange={change} className={styles.list}>
          {groups.map(group => <ListBoxSection key={group.id} id={group.id} className={styles.section}>
            <Header className={styles.sectionTitle}>{group.title}</Header>
            {group.grants.map(grant => <ListBoxItem key={grant} id={grant} textValue={copy.grants[grant as keyof typeof copy.grants] ?? grant} className={styles.option}>
              <span className={styles.box} aria-hidden="true"><Check /></span>
              <span>{copy.grants[grant as keyof typeof copy.grants] ?? grant}</span>
            </ListBoxItem>)}
          </ListBoxSection>)}
        </ListBox>
      </Popover>
    </DialogTrigger>
  </div>;
}

/** The assistant's OAuth request, shown in the sign-in card: who asks, where it returns, and which permissions to grant. */
function ConsentRequest({ authorizationId }: { authorizationId: string }) {
  const uiCopy = useUiCopy();
  const copy = useIntegrationCopy();
  const { account } = useAccountContext();
  const [chosen, setChosen] = useState<string[] | null>(null);
  const [confirming, setConfirming] = useState(false);
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
    <div className={styles.loading}><Skeleton height="4rem" /><Skeleton height="2.75rem" /><Skeleton height="2.75rem" /></div>
  </>;
  if (query.error) return <>
    <LinkVisual />
    <AuthHeader title={copy.consentTitle} subtitle={signedIn} />
    <IntegrationError error={query.error} />
    <Button variant="secondary" block onPress={() => void query.refetch()}>{uiCopy["ui"]["Retry authorization request"]}</Button>
  </>;

  const details = query.data;
  // Everything the assistant asks for starts selected; the coach can narrow it before allowing.
  const selected = chosen ?? details.availableGrants;
  const allow = () => save.mutate({ method: "POST", path, json: { grants: selected } }, { onSettled: () => setConfirming(false) });
  return <>
    <LinkVisual />
    <AuthHeader title={formatInterfaceText(uiCopy["ui"]["Connect {0}"], [details.clientName])} subtitle={signedIn} />
    <dl className={styles.details} aria-label={copy.requestDetails}>
      <div><dt>{copy.clientId}</dt><dd><code>{details.clientId}</code></dd></div>
      <div><dt>{uiCopy["ui"]["Registered callback"]}</dt><dd><code>{details.redirectUri}</code></dd></div>
    </dl>
    <PermissionSelect available={details.availableGrants} selected={selected} onChange={setChosen} disabled={save.isPending} />
    <p className={styles.note}>{copy.consentNote}</p>
    <IntegrationError error={save.error ?? redirectError} />
    <div className={styles.actions}>
      <Button variant="secondary" isDisabled={save.isPending} onPress={() => save.mutate({ method: "POST", path: `${path}/deny` })}>{uiCopy["ui"]["Deny"]}</Button>
      <Button variant="primary" loading={save.isPending && !confirming} isDisabled={!selected.length || save.isPending} onPress={() => setConfirming(true)}>{uiCopy["ui"]["Allow selected permissions"]}</Button>
    </div>
    <AlertDialog
      isOpen={confirming}
      onOpenChange={setConfirming}
      title={copy.confirmTitle(details.clientName)}
      confirmLabel={copy.confirmAllow}
      cancelLabel={copy.confirmBack}
      isConfirming={save.isPending}
      onConfirm={allow}
    >
      <div className={styles.confirm}>
        <section><h3>{copy.confirmDoes}</h3><p>{copy.confirmDoesBody(copy.permissions(selected.length))}</p></section>
        <section><h3>{copy.confirmRisk}</h3><p>{copy.confirmRiskBody}</p></section>
        <p className={styles.confirmFoot}>{copy.forbidden}</p>
      </div>
    </AlertDialog>
  </>;
}
