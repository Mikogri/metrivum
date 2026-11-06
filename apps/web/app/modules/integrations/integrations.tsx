import { useAppLocale, useT as useUiCopy } from "~/shared/i18n/AppLocale";
import { useId, useState, type ReactNode } from "react";
import { Ban, Bot, Check, ChevronDown, ChevronRight, ClipboardCheck, Copy, ExternalLink, History, KeyRound, MessageSquare, Plug, ShieldCheck, Sparkles, TriangleAlert, Unplug } from "lucide-react";
import { Link } from "react-router";
import { Alert, Badge, Button, Card, Checkbox, EmptyState, InfoTip, Pagination, Skeleton, TextArea, type BadgeTone } from "@metrivum/ui-web";
import { apiBaseUrl } from "~/shared/http/config";
import { connectionStatus, grants, useIntegrationMutation, useIntegrationQuery, type Action, type Activity, type Connection, type Preferences } from "./api";
import { useIntegrationCopy } from "./copy";
import { formatAgo, formatDate, formatDateTime } from "./format";
import styles from "./integrations.module.css";

const PAGE_SIZE = 10;
const STATUS_TONE = { active: "success", attention: "warning", revoked: "neutral" } as const satisfies Record<ReturnType<typeof connectionStatus>, BadgeTone>;
const ACTIVITY_TONE: Record<string, BadgeTone> = { Executed: "success", Approved: "info", Pending: "warning", Rejected: "danger", Failed: "danger", Expired: "neutral" };

/** A card's title row: icon tile, title with an optional line under it, and anything on the right. */
function SectionHead({ icon, title, hint, aside, id }: { icon: ReactNode; title: string; hint?: ReactNode; aside?: ReactNode; id?: string }) {
  return <header className={styles.sectionHead}>
    <span className={styles.sectionIcon} aria-hidden="true">{icon}</span>
    <div className={styles.sectionText}><h2 id={id} className={styles.heading}>{title}</h2>{hint ? <p className={styles.hint}>{hint}</p> : null}</div>
    {aside ? <div className={styles.sectionAside}>{aside}</div> : null}
  </header>;
}

/** Content that folds open and closed smoothly. */
function Fold({ open, id, children }: { open: boolean; id?: string; children: ReactNode }) {
  return <div id={id} className={styles.fold} data-open={open || undefined} inert={!open}><div className={styles.foldClip}>{children}</div></div>;
}

/** A step-by-step guide that folds open, one per assistant. */
function Guide({ icon, title, sub, children }: { icon: ReactNode; title: string; sub: string; children: ReactNode }) {
  const copy = useIntegrationCopy();
  const [open, setOpen] = useState(false);
  const id = useId();
  return <div className={styles.guide} data-open={open || undefined}>
    <button type="button" className={styles.guideHead} aria-expanded={open} aria-controls={id} onClick={() => setOpen(value => !value)}>
      <span className={styles.guideIcon} aria-hidden="true">{icon}</span>
      <span className={styles.guideText}><strong>{title}</strong><small>{sub}</small></span>
      <span className={styles.guideTag}>{copy.setup}</span>
      <ChevronDown aria-hidden="true" className={styles.chevron} />
    </button>
    <Fold open={open} id={id}><div className={styles.guideInner}>{children}</div></Fold>
  </div>;
}

export function IntegrationError({ error }: { error: unknown }) {
  const uiCopy = useUiCopy();
  return error ? <Alert tone="danger" title={error instanceof Error ? error.message : uiCopy["ui"]["Could not complete this request"]} /> : null;
}

export function PermissionChoices({ available, selected, onChange, disabled = false }: { available: string[]; selected: string[]; onChange: (value: string[]) => void; disabled?: boolean }) {
  const copy = useIntegrationCopy();
  return <div className={styles.grantGroups}>{[true, false].map(read => <div key={String(read)} className={styles.grantGroup}>
    <h3 className={styles.grantTitle}>{read ? copy.read : copy.write}</h3>
    <div className={styles.grants}>{available.filter(grant => grant.startsWith("read_") === read).map(grant => <Checkbox key={grant} isSelected={selected.includes(grant)} isDisabled={disabled} onChange={checked => onChange(checked ? [...selected, grant] : selected.filter(value => value !== grant))}>{copy.grants[grant as keyof typeof copy.grants] ?? grant}</Checkbox>)}</div>
  </div>)}</div>;
}

function ConnectionRow({ connection, reload }: { connection: Connection; reload: () => void }) {
  const uiCopy = useUiCopy();
  const copy = useIntegrationCopy();
  const { locale } = useAppLocale();
  const [managing, setManaging] = useState(false);
  const [selected, setSelected] = useState(connection.grants);
  const save = useIntegrationMutation<Connection>();
  const revoke = useIntegrationMutation<Connection>();
  const status = connectionStatus(connection);
  const pending = save.isPending || revoke.isPending;
  const revoked = !!connection.revokedAt;
  const dirty = selected.length !== connection.grants.length || selected.some(value => !connection.grants.includes(value));
  const error = save.error ?? revoke.error;
  const panel = useId();
  return <li className={styles.connection} data-state={status}>
    <div className={styles.connectionMain}>
      <span className={styles.connectionIcon} aria-hidden="true"><Bot /></span>
      <div className={styles.connectionText}>
        <div className={styles.connectionTitle}>
          <h3>{connection.clientName}</h3>
          <Badge tone={STATUS_TONE[status]} dot size="sm">{copy[status]}</Badge>
        </div>
        <p className={styles.meta}>
          <span>{copy.connectedOn} {formatDate(connection.createdAt, locale)}</span>
          <span title={connection.lastUsedAt ? formatDateTime(connection.lastUsedAt, locale) : undefined}>{connection.lastUsedAt ? `${copy.lastUsed} ${formatAgo(connection.lastUsedAt, locale)}` : copy.neverUsed}</span>
          {!revoked ? <span>{copy.permissions(connection.grants.length)}</span> : null}
        </p>
        <p className={styles.identity}>{copy.clientId} <code>{connection.clientId}</code></p>
      </div>
      {!revoked ? <div className={styles.connectionActions}>
        <Button size="sm" variant="secondary" aria-expanded={managing} aria-controls={panel} iconEnd={<ChevronDown className={styles.chevron} data-open={managing || undefined} />} onPress={() => setManaging(value => !value)}>{copy.manageAccess}</Button>
        <Button size="sm" variant="ghost" iconStart={<Unplug />} loading={revoke.isPending} isDisabled={pending} onPress={() => revoke.mutate({ method: "POST", path: `/api/v1/me/ai-integrations/${connection.id}/revoke` })}>{uiCopy["ui"]["Disconnect"]}</Button>
      </div> : null}
    </div>
    {status === "attention" ? <p className={styles.notice}><TriangleAlert aria-hidden="true" />{copy.reconnect}</p> : null}
    {error ? <div className={styles.rowError}>
      <IntegrationError error={error} />
      <Button size="sm" isDisabled={pending} onPress={() => { save.reset(); revoke.reset(); reload(); }}>{uiCopy["ui"]["Reload current permissions"]}</Button>
    </div> : null}
    {!revoked ? <Fold open={managing} id={panel}>
      <div className={styles.manage}>
        <PermissionChoices available={Object.keys(grants)} selected={selected} onChange={setSelected} disabled={pending} />
        <div className={styles.manageFoot}>
          <Button size="sm" variant="ghost" isDisabled={pending} onPress={() => { setSelected(connection.grants); setManaging(false); }}>{copy.cancel}</Button>
          <Button size="sm" variant="primary" loading={save.isPending} isDisabled={pending || !dirty} onPress={() => save.mutate({ method: "PATCH", path: `/api/v1/me/ai-integrations/${connection.id}/grants`, json: { grants: selected, expectedVersion: connection.version } })}>{uiCopy["ui"]["Save permissions"]}</Button>
        </div>
      </div>
    </Fold> : null}
  </li>;
}

function PreferencesEditor({ preferences, reload }: { preferences: Preferences; reload: () => void }) {
  const uiCopy = useUiCopy();
  const [note, setNote] = useState(preferences.note);
  const [share, setShare] = useState(preferences.shareWithIntegrations);
  const save = useIntegrationMutation<Preferences>();
  const dirty = note !== preferences.note || share !== preferences.shareWithIntegrations;
  return <form className={styles.preferences} onSubmit={event => { event.preventDefault(); if (dirty) save.mutate({ method: "PATCH", path: "/api/v1/me/ai-programming-preferences", json: { note, shareWithIntegrations: share, expectedVersion: preferences.version } }); }}>
    <TextArea label={uiCopy["ui"]["Programming preferences"]} description={uiCopy["ui"]["Your coaching rules, preferred structure and exercise selection. This note does not train a model."]} placeholder={uiCopy.settings.aiPreferencesPlaceholder} value={note} onChange={setNote} maxLength={8000} />
    <IntegrationError error={save.error} />
    {save.error ? <div><Button size="sm" isDisabled={save.isPending} onPress={() => { save.reset(); reload(); }}>{uiCopy["ui"]["Reload current preferences"]}</Button></div> : null}
    <div className={styles.preferencesFoot}>
      <Checkbox isSelected={share} onChange={setShare} isDisabled={save.isPending}>{uiCopy["ui"]["Share this note with connected assistants"]}</Checkbox>
      <Button variant="primary" type="submit" loading={save.isPending} isDisabled={!dirty}>{uiCopy["ui"]["Save preferences"]}</Button>
    </div>
  </form>;
}

function RowsSkeleton({ rows = 2, height = "4.5rem" }: { rows?: number; height?: string }) {
  return <div className={styles.skeletons}>{Array.from({ length: rows }, (_, n) => <Skeleton key={n} height={height} />)}</div>;
}

function Retry({ error, label, onRetry }: { error: unknown; label: string; onRetry: () => void }) {
  return <div className={styles.rowError}><IntegrationError error={error} /><div><Button size="sm" onPress={onRetry}>{label}</Button></div></div>;
}

export function Integrations() {
  const uiCopy = useUiCopy();
  const copy = useIntegrationCopy();
  const { locale } = useAppLocale();
  const connections = useIntegrationQuery<Connection[]>("/api/v1/me/ai-integrations");
  const actions = useIntegrationQuery<Action[]>("/api/v1/me/ai-actions", { status: "Pending" });
  const history = useIntegrationQuery<Activity[]>("/api/v1/me/ai-activity");
  const preferences = useIntegrationQuery<Preferences>("/api/v1/me/ai-programming-preferences");
  const endpoint = `${apiBaseUrl()}/mcp`;
  const [copyStatus, setCopyStatus] = useState<"" | "copied" | "error">("");
  const [page, setPage] = useState(1);
  const live = connections.data?.filter(item => !item.revokedAt).length ?? 0;
  const pages = history.data ? Math.max(1, Math.ceil(history.data.length / PAGE_SIZE)) : 1;
  const copyEndpoint = async () => {
    try {
      await navigator.clipboard.writeText(endpoint);
      setCopyStatus("copied");
      window.setTimeout(() => setCopyStatus(value => (value === "copied" ? "" : value)), 2000);
    } catch {
      setCopyStatus("error");
    }
  };
  return <div className={styles.stack}>
    <Card as="section" padding="lg" className={styles.card} id="available-integrations" aria-labelledby="ai-setup-title">
      <SectionHead id="ai-setup-title" icon={<Plug />} title={copy.available} hint={uiCopy["ui"]["Connect from your assistant using OAuth and choose which data it may read or private drafts it may create. Returned private content is shared with that assistant. Messages require your review and explicit approval here. Disconnecting blocks the next tool request."]} />
      <div className={styles.endpoint}>
        <span className={styles.endpointLabel}>{copy.endpoint}</span>
        <div className={styles.endpointField}>
          <code>{endpoint}</code>
          <Button size="sm" variant="secondary" iconStart={copyStatus === "copied" ? <Check /> : <Copy />} onPress={() => void copyEndpoint()}>{copyStatus === "copied" ? copy.copied : copy.copyUrl}</Button>
        </div>
        <span role="status" className={copyStatus === "error" ? styles.copyError : styles.srOnly}>{copyStatus === "copied" ? copy.copied : copyStatus === "error" ? copy.copyError : ""}</span>
      </div>
      <div className={styles.guides}>
        <Guide icon={<Bot />} title={uiCopy["ui"]["Connect to ChatGPT"]} sub={copy.setupHint}>
          <ol className={styles.steps}><li>{uiCopy["ui"]["Enable developer mode on ChatGPT web if your plan and workspace allow it."]}</li><li>{uiCopy["ui"]["Open Apps → Create, enter the MCP endpoint above and select OAuth."]}</li><li>{uiCopy["ui"]["Sign in to Metrivum, choose permissions, then scan the tools and create the app."]}</li></ol>
          <p className={styles.guideNote}>{copy.compatible}</p>
          <a className={styles.external} href="https://help.openai.com/en/articles/12584461-developer-mode-and-mcp-apps-in-chatgpt" target="_blank" rel="noreferrer">{uiCopy["ui"]["Current ChatGPT requirements"]}<ExternalLink aria-hidden="true" /></a>
        </Guide>
        <Guide icon={<Sparkles />} title={uiCopy["ui"]["Connect to Claude"]} sub={copy.setupHint}>
          <ol className={styles.steps}><li>{uiCopy["ui"]["Open Customize → Connectors → Add custom connector. Workspace owners may need to add it first."]}</li><li>{uiCopy["ui"]["Enter the public HTTPS MCP endpoint above, review the detected OAuth settings and sign in."]}</li><li>{uiCopy["ui"]["Review the Metrivum permissions, then enable the connector for your conversation."]}</li></ol>
          <p className={styles.guideNote}>{copy.compatible}</p>
          <a className={styles.external} href="https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp" target="_blank" rel="noreferrer">{uiCopy["ui"]["Current Claude requirements"]}<ExternalLink aria-hidden="true" /></a>
        </Guide>
        <Guide icon={<Plug />} title={copy.other} sub={copy.setupHint}><p>{copy.otherHelp}</p><code className={styles.inlineCode}>{endpoint}</code></Guide>
      </div>
      <ul className={styles.rules}>
        <li><ShieldCheck aria-hidden="true" />{copy.actions}</li>
        <li><Ban aria-hidden="true" />{copy.forbidden}</li>
      </ul>
    </Card>

    <Card as="section" padding="lg" className={styles.card} aria-labelledby="ai-connections-title">
      <SectionHead id="ai-connections-title" icon={<KeyRound />} title={copy.connected} aside={<>
        {connections.data?.length ? <Badge tone={live ? "success" : "neutral"} size="sm">{live}</Badge> : null}
        <InfoTip label={copy.statusInfo} placement="bottom end">{copy.consentStatus}</InfoTip>
      </>} />
      {connections.isPending ? <RowsSkeleton /> : connections.error ? <Retry error={connections.error} label={uiCopy["ui"]["Retry connections"]} onRetry={() => void connections.refetch()} /> : connections.data.length ? <ul className={styles.list}>
        {connections.data.map(connection => <ConnectionRow key={`${connection.id}:${connection.version}:${connection.revokedAt}`} connection={connection} reload={() => void connections.refetch()} />)}
      </ul> : <EmptyState size="sm" icon={<Plug />} title={copy.notConnected} description={uiCopy["ui"]["No assistants connected. Start in ChatGPT or Claude using the steps above."]} />}
    </Card>

    <Card as="section" padding="lg" className={styles.card} aria-labelledby="ai-actions-title">
      <SectionHead id="ai-actions-title" icon={<ClipboardCheck />} title={uiCopy["ui"]["Pending actions"]} aside={actions.data?.length ? <Badge tone="warning" dot size="sm">{actions.data.length}</Badge> : null} />
      {actions.isPending ? <RowsSkeleton rows={1} height="3.5rem" /> : actions.error ? <Retry error={actions.error} label={uiCopy["ui"]["Retry actions"]} onRetry={() => void actions.refetch()} /> : actions.data.length ? <ul className={styles.list}>
        {actions.data.map(action => <li key={action.id}>
          <Link className={styles.actionRow} to={`/app/integrations/actions/${action.id}`}>
            <span className={styles.actionIcon} aria-hidden="true">{action.type === "AssignProgram" ? <ClipboardCheck /> : <MessageSquare />}</span>
            <span className={styles.actionText}>
              <strong>{action.type === "AssignProgram" ? copy.reviewAssignment : uiCopy["ui"]["Review message to"]} {action.recipients.map(recipient => recipient.displayName).join(", ")}</strong>
              <small>{action.clientName} · {action.conversationTitle} · {formatAgo(action.createdAt, locale)}</small>
            </span>
            <ChevronRight aria-hidden="true" className={styles.actionArrow} />
          </Link>
        </li>)}
      </ul> : <p className={styles.quiet}><Check aria-hidden="true" />{uiCopy["ui"]["No actions waiting for approval."]}</p>}
    </Card>

    <Card as="section" padding="lg" className={styles.card} aria-labelledby="ai-history-title">
      <SectionHead id="ai-history-title" icon={<History />} title={copy.history} aside={<InfoTip label={copy.historyInfo} placement="bottom end">{copy.historyLimit}</InfoTip>} />
      {history.isPending ? <RowsSkeleton rows={3} height="2.75rem" /> : history.error ? <IntegrationError error={history.error} /> : history.data.length ? <>
        <ul className={styles.history}>
          {history.data.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((item, index) => {
            const label = `${item.clientName} · ${item.operation}`;
            return <li key={`${item.connectionId}:${item.at}:${index}`} className={styles.historyRow}>
              <span className={styles.historyText}>
                {item.actionId ? <Link to={`/app/integrations/actions/${item.actionId}`}>{label}</Link> : <span>{label}</span>}
                <small>{formatDateTime(item.at, locale)}{item.resultId ? ` · ${item.resultId}` : ""}</small>
              </span>
              <Badge tone={ACTIVITY_TONE[item.status] ?? "neutral"} size="sm">{copy.statuses[item.status] ?? item.status}</Badge>
            </li>;
          })}
        </ul>
        <Pagination className={styles.pagination} page={page} pageCount={pages} onPageChange={setPage} labels={{ previous: copy.previous, next: copy.next, status: copy.page, navigation: copy.history }} />
      </> : <p className={styles.quiet}>{copy.emptyHistory}</p>}
    </Card>

    <Card as="section" padding="lg" className={styles.card} aria-labelledby="ai-preferences-title">
      <SectionHead id="ai-preferences-title" icon={<Sparkles />} title={uiCopy["ui"]["AI workflow preferences"]} />
      {preferences.isPending ? <RowsSkeleton rows={1} height="9rem" /> : preferences.error ? <Retry error={preferences.error} label={uiCopy["ui"]["Retry preferences"]} onRetry={() => void preferences.refetch()} /> : <PreferencesEditor key={preferences.data.version} preferences={preferences.data} reload={() => void preferences.refetch()} />}
    </Card>
  </div>;
}
