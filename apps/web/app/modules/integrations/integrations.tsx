import { useId, useState } from "react";
import { Bot, ChevronDown, ExternalLink, Sparkles } from "lucide-react";
import { Link } from "react-router";
import { Alert, Badge, Button, Card, Checkbox, Skeleton, TextArea } from "@metrivum/ui-web";
import { apiBaseUrl } from "~/shared/http/config";
import { grants, grantLabel, useIntegrationMutation, useIntegrationQuery, type Action, type Connection, type Preferences } from "./api";
import styles from "./integrations.module.css";

/** A step-by-step guide that folds open smoothly, one per assistant. */
function Guide({ icon, title, sub, children }: { icon: React.ReactNode; title: string; sub: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return <div className={styles.guide} data-open={open || undefined}>
    <button type="button" className={styles.guideHead} aria-expanded={open} aria-controls={id} onClick={() => setOpen(value => !value)}>
      <span className={styles.guideIcon} aria-hidden="true">{icon}</span>
      <span className={styles.guideText}><strong>{title}</strong><small>{sub}</small></span>
      <ChevronDown aria-hidden="true" className={styles.guideChevron} />
    </button>
    <div id={id} className={styles.guideBody} inert={!open}>
      <div className={styles.guideClip}><div className={styles.guideInner}>{children}</div></div>
    </div>
  </div>;
}

export function IntegrationError({ error }: { error: unknown }) {
  return error ? <Alert tone="danger" title={error instanceof Error ? error.message : "Could not complete this request"} /> : null;
}
export function PermissionChoices({ available, selected, onChange, disabled = false }: { available: string[]; selected: string[]; onChange: (value: string[]) => void; disabled?: boolean }) {
  return <div className={styles.grants}>{available.map(grant => <Checkbox key={grant} isSelected={selected.includes(grant)} isDisabled={disabled} onChange={checked => onChange(checked ? [...selected, grant] : selected.filter(value => value !== grant))}>{grantLabel(grant)}</Checkbox>)}</div>;
}
function ConnectionCard({ connection, reload }: { connection: Connection; reload: () => void }) {
  const [selected, setSelected] = useState(connection.grants);
  const save = useIntegrationMutation<Connection>();
  const busy = save.isPending || !!connection.revokedAt;
  const dirty = selected.length !== connection.grants.length || selected.some(value => !connection.grants.includes(value));
  return <Card as="section" padding="lg" className={styles.card}>
    <div className={styles.actions}><h3 className={styles.heading}>{connection.clientName}</h3><Badge tone={connection.revokedAt ? "neutral" : "success"}>{connection.revokedAt ? "Disconnected" : "Connected"}</Badge></div>
    <p className={styles.identity}>Client ID: {connection.clientId}</p>
    <p className={styles.hint}>Connected {new Date(connection.createdAt).toLocaleDateString()} · Last used {connection.lastUsedAt ? new Date(connection.lastUsedAt).toLocaleString() : "Never"}</p>
    <PermissionChoices available={Object.keys(grants)} selected={selected} onChange={setSelected} disabled={busy} />
    <IntegrationError error={save.error} />
    {save.error && <Button isDisabled={save.isPending} onPress={() => { save.reset(); reload(); }}>Reload current permissions</Button>}
    {!connection.revokedAt && <div className={styles.actions}>
      <Button variant="primary" isDisabled={busy || !dirty} onPress={() => save.mutate({ method: "PATCH", path: `/api/v1/me/ai-integrations/${connection.id}/grants`, json: { grants: selected, expectedVersion: connection.version } })}>Save permissions</Button>
      <Button isDisabled={busy} onPress={() => save.mutate({ method: "POST", path: `/api/v1/me/ai-integrations/${connection.id}/revoke` })}>Disconnect</Button>
    </div>}
  </Card>;
}
function PreferencesEditor({ preferences, reload }: { preferences: Preferences; reload: () => void }) {
  const [note, setNote] = useState(preferences.note);
  const [share, setShare] = useState(preferences.shareWithIntegrations);
  const save = useIntegrationMutation<Preferences>();
  const dirty = note !== preferences.note || share !== preferences.shareWithIntegrations;
  return <form className={styles.card} onSubmit={event => { event.preventDefault(); if (dirty) save.mutate({ method: "PATCH", path: "/api/v1/me/ai-programming-preferences", json: { note, shareWithIntegrations: share, expectedVersion: preferences.version } }); }}>
    <TextArea label="Programming preferences" description="Your coaching rules, preferred structure and exercise selection. This note does not train a model." value={note} onChange={setNote} maxLength={8000} />
    <Checkbox isSelected={share} onChange={setShare} isDisabled={save.isPending}>Share this note with connected assistants</Checkbox>
    <IntegrationError error={save.error} />
    {save.error && <Button isDisabled={save.isPending} onPress={() => { save.reset(); reload(); }}>Reload current preferences</Button>}
    <div><Button variant="primary" type="submit" loading={save.isPending} isDisabled={!dirty}>Save preferences</Button></div>
  </form>;
}
export function Integrations() {
  const connections = useIntegrationQuery<Connection[]>("/api/v1/me/ai-integrations");
  const actions = useIntegrationQuery<Action[]>("/api/v1/me/ai-actions", { status: "Pending" });
  const preferences = useIntegrationQuery<Preferences>("/api/v1/me/ai-programming-preferences");
  const endpoint = `${apiBaseUrl()}/mcp`;
  return <div className={styles.stack}>
    <Card as="section" padding="lg" className={styles.card}>
      <h2 className={styles.heading}>Connected AI assistants</h2>
      <p className={styles.hint}>Connect from your assistant using OAuth and choose which data it may read or private drafts it may create. Returned private content is shared with that assistant. Messages require your review and explicit approval here. Disconnecting blocks the next tool request.</p>
      <p className={styles.identity}>MCP endpoint: <code>{endpoint}</code></p>
      <div className={styles.guides}>
      <Guide icon={<Bot />} title="Connect to ChatGPT" sub="Developer mode, OAuth, three steps">
        <ol><li>Enable developer mode on ChatGPT web if your plan and workspace allow it.</li><li>Open Apps → Create, enter the MCP endpoint above and select OAuth.</li><li>Sign in to Metrivum, choose permissions, then scan the tools and create the app.</li></ol>
        <p className={styles.hint}>Pro supports read/fetch MCP apps in developer mode. Full modify/write support is available in beta for Business, Enterprise and Edu, subject to workspace administrator permissions. If write tools are unavailable, review and edit drafts in Metrivum.</p>
        <a href="https://help.openai.com/en/articles/12584461-developer-mode-and-mcp-apps-in-chatgpt" target="_blank" rel="noreferrer">Current ChatGPT requirements<ExternalLink aria-hidden="true" /></a>
      </Guide>
      <Guide icon={<Sparkles />} title="Connect to Claude" sub="Custom connector, OAuth, three steps">
        <ol><li>Open Customize → Connectors → Add custom connector. Workspace owners may need to add it first.</li><li>Enter the public HTTPS MCP endpoint above, review the detected OAuth settings and sign in.</li><li>Review the Metrivum permissions, then enable the connector for your conversation.</li></ol>
        <p className={styles.hint}>Remote custom connectors support Free, Pro, Max, Team and Enterprise; Free is limited to one custom connector. Workspace policies may restrict access. The server must be publicly reachable.</p>
        <a href="https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp" target="_blank" rel="noreferrer">Current Claude requirements<ExternalLink aria-hidden="true" /></a>
      </Guide>
      </div>
    </Card>
    {connections.isPending ? <Skeleton height="8rem" /> : connections.error ? <><IntegrationError error={connections.error} /><Button onPress={() => void connections.refetch()}>Retry connections</Button></> : connections.data.length ? connections.data.map(connection => <ConnectionCard key={`${connection.id}:${connection.version}:${connection.revokedAt}`} connection={connection} reload={() => void connections.refetch()} />) : <p className={styles.hint}>No assistants connected. Start in ChatGPT or Claude using the steps above.</p>}
    <Card as="section" padding="lg" className={styles.card}>
      <h2 className={styles.heading}>Pending actions</h2>
      {actions.isPending ? <Skeleton /> : actions.error ? <><IntegrationError error={actions.error} /><Button onPress={() => void actions.refetch()}>Retry actions</Button></> : actions.data.length ? actions.data.map(action => <div key={action.id} className={styles.card}><p>{action.clientName} · {action.conversationTitle}</p><Link to={`/app/integrations/actions/${action.id}`}>Review message to {action.recipients.map(recipient => recipient.displayName).join(", ")}</Link></div>) : <p className={styles.hint}>No actions waiting for approval.</p>}
    </Card>
    <Card as="section" padding="lg" className={styles.card}>
      <h2 className={styles.heading}>AI workflow preferences</h2>
      {preferences.isPending ? <Skeleton /> : preferences.error ? <><IntegrationError error={preferences.error} /><Button onPress={() => void preferences.refetch()}>Retry preferences</Button></> : <PreferencesEditor key={preferences.data.version} preferences={preferences.data} reload={() => void preferences.refetch()} />}
    </Card>
  </div>;
}
