import { formatInterfaceText } from "~/shared/i18n/interface-format";
import { useT as useUiCopy } from "~/shared/i18n/AppLocale";
import { useEffect, useState } from "react";
import { FileText, Image as ImageIcon, MoreHorizontal, NotebookPen, Pencil, Plus, Scale } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Schema } from "@metrivum/api-client-web";
import {
  Alert,
  AlertDialog,
  Badge,
  Button,
  DataTable,
  Dialog,
  DialogFooter,
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  EmptyState,
  IconButton,
  Option,
  SearchInput,
  Segment,
  SegmentedControl,
  Select,
  Spinner,
  TextArea,
  TextField,
  Toolbar,
} from "@metrivum/ui-web";
import { useAccountContext, useAccountKey, useApi } from "~/shared/session/AccountScope";
import { useCoachingMutation, useCoachingQuery, type Page } from "~/modules/coaching";
import { Failure, ListPagination, Loading, MutationError } from "~/modules/coaching";
import { Panel, StatStrip } from "~/shared/ui/Panel";
import { PeriodFilter } from "~/shared/ui/PeriodFilter";
import { MeasurementChart } from "./measurement-chart";
import styles from "./documentation.module.css";

type Access = Schema<"DocumentationAccess">;
type Definition = Schema<"MeasurementDefinition">;
type Measurement = Schema<"MeasurementDto">;
type Trend = Schema<"MeasurementTrend">;
type Note = Schema<"NoteDto">;
type Document = Schema<"DocumentDto">;
type Upload = Schema<"DocumentUpload">;

const localDay = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const today = () => localDay();
const daysBack = (days: number) => localDay(new Date(Date.now() - (days - 1) * 86_400_000));
const iso = (date: string) => (date === today() ? new Date().toISOString() : new Date(`${date}T12:00:00Z`).toISOString());
const root = (id: string) => `/api/v1/coaching/relationships/${id}/documentation`;
const fmt = (value: number) => value.toLocaleString(undefined, { maximumFractionDigits: 2 });

export function RelationshipDocumentation({ relationshipId, clientView = false }: { relationshipId: string; clientView?: boolean }) {
  const account = useAccountKey();
  return <Documentation key={`${account}:${relationshipId}:${clientView}`} relationshipId={relationshipId} clientView={clientView} />;
}

type Section = "documents" | "notes";

function Documentation({ relationshipId, clientView }: { relationshipId: string; clientView: boolean }) {
  const uiCopy = useUiCopy();

  const [tab, setTab] = useState<Section>("documents");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [creating, setCreating] = useState(false);
  const access = useCoachingQuery<Access>(`${root(relationshipId)}/`);
  if (access.isPending) return <Loading />;
  if (access.isError) return <Failure error={access.error} retry={() => void access.refetch()} />;
  const canWrite = access.data.allowedActions.includes("create");
  const coach = access.data.coach && !clientView;
  const sections: Array<[Section, string, React.ReactNode]> = [
    ["documents", "Files", <FileText key="f" />],
    ...(coach ? [["notes", "Private Coach Notes", <NotebookPen key="n" />] as [Section, string, React.ReactNode]] : []),
  ];
  const addLabel = tab === "documents" ? "Add file" : "New note";
  const base = root(relationshipId);
  return (
    <section className={styles.workspace} aria-label={uiCopy["ui"]["Relationship documentation"]}>
      {!canWrite && <Alert title={formatInterfaceText(uiCopy["ui"]["{0} relationship — historical records are read-only."], [access.data.status])} tone="info" />}
      <Toolbar aria-label={uiCopy["ui"]["Documentation"]} className={styles.toolbar}>
        <SegmentedControl
          aria-label={uiCopy["ui"]["Documentation sections"]}
          selectedKeys={[tab]}
          onSelectionChange={(keys) => {
            const next = [...keys][0] as Section | undefined;
            if (next) {
              setTab(next);
              setSearch("");
            }
          }}
        >
          {sections.map(([key, label, icon]) => (
            <Segment key={key} id={key}>
              <span className={styles.segment}>{icon}{label}</span>
            </Segment>
          ))}
        </SegmentedControl>
        <SearchInput
          aria-label={tab === "documents" ? uiCopy["ui"]["Search documents"] : uiCopy["ui"]["Search private notes"]}
          placeholder={uiCopy["training"]["library"]["searchPlaceholder"]}
          value={search}
          onChange={setSearch}
          className={styles.search}
        />
        {tab === "documents" ? (
          <Select aria-label={uiCopy["ui"]["File category"]} className={styles.category} selectedKey={category} onSelectionChange={(key) => setCategory(String(key))}>
            <Option id="All">{uiCopy["ui"]["All files"]}</Option>
            <Option id="ProgressPhoto">{uiCopy["ui"]["Progress photos"]}</Option>
            <Option id="Files">{uiCopy["ui"]["Other files and documents"]}</Option>
          </Select>
        ) : null}
        <span className={styles.spacer} />
        {canWrite ? (
          <Button variant="primary" iconStart={<Plus />} onPress={() => setCreating(true)}>
            {addLabel}
          </Button>
        ) : null}
      </Toolbar>
      {tab === "notes" && coach ? (
        <Notes base={base} canWrite={canWrite} search={search} creating={creating} onCreatingChange={setCreating} />
      ) : (
        <Documents key={`${tab}:${category}`} base={base} canWrite={canWrite} coach={coach} search={search} category={category} creating={creating} onCreatingChange={setCreating} />
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ body metrics */

export function BodyMeasurements({ relationshipId }: { relationshipId: string }) {
  const uiCopy = useUiCopy();

  const account = useAccountKey();
  const access = useCoachingQuery<Access>(`${root(relationshipId)}/`);
  if (access.isPending) return <Panel title={uiCopy["ui"]["Body metrics"]} icon={<Scale />} tone="rose"><MeasurementsSkeleton /></Panel>;
  if (access.isError) return <Failure error={access.error} retry={() => void access.refetch()} />;
  return <Measurements key={`${account}:${relationshipId}`} base={root(relationshipId)} canWrite={access.data.allowedActions.includes("measure")} canEdit={access.data.coach} />;
}

/** Loading body metrics: one centred spinner where the numbers and the chart will appear. */
function MeasurementsSkeleton() {
 const uiCopy = useUiCopy();

  return (
    <div className={styles.chartLoading} role="status" aria-label={uiCopy["ui"]["Loading measurements"]}>
      <Spinner size="md" />
    </div>
  );
}

function Measurements({ base, canWrite, canEdit }: { base: string; canWrite: boolean; canEdit: boolean }) {
  const uiCopy = useUiCopy();

  const [editing, setEditing] = useState<Measurement | "new" | null>(null);
  const [key, setKey] = useState("weight");
  const [unit, setUnit] = useState("kg");
  const [page, setPage] = useState(1);
  const [from, setFrom] = useState(() => daysBack(90));
  const [to, setTo] = useState(today);
  const definitions = useCoachingQuery<Definition[]>(`${base}/measurement-definitions`);
  const range = { from: `${from}T00:00:00Z`, to: `${to}T23:59:59Z` };
  const list = useCoachingQuery<Page<Measurement>>(`${base}/measurements`, { ...range, key, page, pageSize: 15 });
  const trend = useCoachingQuery<Trend>(`${base}/measurements/trend`, { ...range, key, unit });
  const definition = definitions.data?.find((d) => d.key === key);
  const units = definition?.units ?? [unit];
  const changeUnit = key === "body-fat" ? "pp" : unit;

  return (
    <Panel
      title={uiCopy["ui"]["Body metrics"]}
      icon={<Scale />}
      tone="rose"
      actions={
        <>
          <Select
            aria-label={uiCopy["ui"]["Measurement"]}
            selectedKey={key}
            onSelectionChange={(k) => {
              const d = definitions.data?.find((x) => x.key === k);
              if (d) {
                setKey(d.key);
                setUnit(d.units[0]!);
                setPage(1);
              }
            }}
            className={styles.metricSelect}
          >
            {(definitions.data ?? []).map((d) => (
              <Option id={d.key} key={d.key}>{d.label}</Option>
            ))}
          </Select>
          {units.length > 1 ? (
            <Select aria-label={uiCopy["editor"]["panel"]["unit"]} selectedKey={unit} onSelectionChange={(k) => setUnit(String(k))} className={styles.unitSelect}>
              {units.map((u) => (
                <Option id={u} key={u}>{u}</Option>
              ))}
            </Select>
          ) : null}
          <PeriodFilter
            from={from}
            to={to}
            onChange={(next) => {
              setFrom(next.from);
              setTo(next.to);
              setPage(1);
            }}
          />
          {canWrite ? (
            <Button variant="primary" iconStart={<Plus />} onPress={() => setEditing("new")}>

              {uiCopy["ui"]["Add measurement"]}
            </Button>
          ) : null}
        </>
      }
    >
      {definitions.isError && <Failure error={definitions.error} />}
      {trend.isPending ? <MeasurementsSkeleton /> : trend.isError ? <Failure error={trend.error} /> : (
        <div className={styles.trend}>
          <StatStrip
            items={[
              { label: uiCopy["ui"]["Latest"], value: trend.data.latestValue == null ? "—" : `${fmt(Number(trend.data.latestValue))} ${unit}` },
              { label: uiCopy["ui"]["Change in period"], value: trend.data.change == null ? "—" : `${Number(trend.data.change) > 0 ? "+" : ""}${fmt(Number(trend.data.change))} ${changeUnit}` },
              { label: uiCopy["ui"]["Recorded"], value: trend.data.latestAt ? new Date(trend.data.latestAt).toLocaleDateString() : "—" },
            ]}
          />
          <MeasurementChart points={trend.data.points.map((p) => ({ observedAt: p.observedAt, value: Number(p.value) }))} unit={unit} />
        </div>
      )}
      {list.isPending ? null : list.isError ? <Failure error={list.error} /> : list.data.items.length ? (
        <details className={styles.history}>
          <summary>{uiCopy["ui"]["All measurements ("]}{list.data.total})</summary>
          <DataTable
            label={uiCopy["ui"]["Measurements"]}
            rows={list.data.items}
            rowKey={(m) => m.id}
            columns={[
              { id: "date", header: "Date", cell: (m) => new Date(m.observedAt).toLocaleDateString() },
              { id: "value", header: "Value", align: "end", cell: (m) => <strong className={styles.value}>{fmt(Number(m.value))} {m.unit}</strong> },
              { id: "source", header: "Source", hideOnMobile: true, muted: true, cell: (m) => (m.source === "CheckIn" ? "Check-in" : m.source) },
              { id: "comment", header: "Comment", hideOnMobile: true, muted: true, cell: (m) => m.comment || "—" },
              {
                id: "actions",
                header: <span className="tf-visually-hidden">{uiCopy["editor"]["sheet"]["contextLabel"]}</span>,
                width: "3.5rem",
                align: "end",
                cell: (m) => (canWrite && canEdit && m.source !== "CheckIn" ? <IconButton size="sm" label={uiCopy["ui"]["Edit measurement"]} icon={<Pencil />} onPress={() => setEditing(m)} /> : null),
              },
            ]}
          />
          {Number(list.data.total) > Number(list.data.pageSize) ? <ListPagination data={list.data} onChange={setPage} /> : null}
        </details>
      ) : null}
      {editing ? (
        <MeasurementDialog
          key={editing === "new" ? "new" : editing.id}
          base={base}
          measurement={editing === "new" ? null : editing}
          metricKey={editing === "new" ? key : editing.key}
          unit={editing === "new" ? unit : editing.unit}
          label={definition?.label ?? key}
          close={() => setEditing(null)}
        />
      ) : null}
    </Panel>
  );
}

function MeasurementDialog({ base, measurement, metricKey, unit, label, close }: { base: string; measurement: Measurement | null; metricKey: string; unit: string; label: string; close: () => void }) {
  const uiCopy = useUiCopy();

  const [value, setValue] = useState(measurement ? String(measurement.value) : "");
  const [observed, setObserved] = useState(measurement ? measurement.observedAt.slice(0, 10) : today());
  const [comment, setComment] = useState(measurement?.comment ?? "");
  const mutation = useCoachingMutation(close);
  return (
    <Dialog isOpen title={measurement ? uiCopy["ui"]["Edit measurement"] : uiCopy["ui"]["Add measurement"]} description={label} onOpenChange={(open) => { if (!open && !mutation.isPending) close(); }}>
      <form
        className={styles.form}
        onSubmit={(e) => {
          e.preventDefault();
          mutation.mutate({ method: measurement ? "PATCH" : "POST", path: `${base}/measurements${measurement ? `/${measurement.id}` : ""}`, ifMatch: measurement?.version, json: { key: metricKey, unit, value: Number(value), observedAt: iso(observed), comment: comment || null } });
        }}
      >
        <div className={styles.pair}>
          <TextField label={formatInterfaceText(uiCopy["ui"]["Value ({0})"], [unit])} placeholder="e.g. 80.5" type="number" value={value} onChange={setValue} isRequired autoFocus />
          <TextField label={uiCopy["ui"]["Observed date"]} type="date" value={observed} onChange={setObserved} isRequired />
        </div>
        <TextArea label={uiCopy["ui"]["Context / comment"]} placeholder={uiCopy["ui"]["e.g. Morning, before breakfast"]} value={comment} onChange={setComment} maxLength={2000} />
        <MutationError error={mutation.error} />
        <DialogFooter>
          <Button onPress={close} isDisabled={mutation.isPending}>{uiCopy["common"]["cancel"]}</Button>
          <Button type="submit" variant="primary" loading={mutation.isPending} isDisabled={!value || !observed}>{uiCopy["ui"]["Save measurement"]}</Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ notes */

function Notes({ base, canWrite, search, creating, onCreatingChange }: { base: string; canWrite: boolean; search: string; creating: boolean; onCreatingChange: (open: boolean) => void }) {
  const uiCopy = useUiCopy();

  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Note | null>(null);
  const list = useCoachingQuery<Page<Note>>(`${base}/notes`, { search, page, pageSize: 15 });
  return (
    <div className={styles.stack}>
      <p className={styles.hint}>{uiCopy["ui"]["Only the author can access these notes, including in Teams. Notes are never sent in notifications."]}</p>
      {list.isPending ? <Loading /> : list.isError ? <Failure error={list.error} /> : !list.data.items.length ? (
        <EmptyState icon={<NotebookPen />} title={search ? uiCopy["ui"]["No matching notes"] : uiCopy["ui"]["No private notes"]} description={uiCopy["ui"]["Keep call summaries and observations here, visible only to you."]} />
      ) : (
        <>
          <ul className={styles.notes}>
            {list.data.items.map((n) => (
              <li key={n.id} className={styles.note}>
                <header className={styles.noteHead}>
                  <div>
                    <h3>{n.title || uiCopy["ui"]["Private note"]}</h3>
                    <time className={styles.meta}>{uiCopy["training"]["library"]["columns"]["updated"]} {new Date(n.updatedAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</time>
                  </div>
                  {canWrite ? <IconButton size="sm" label={uiCopy["ui"]["Edit note"]} icon={<Pencil />} onPress={() => setEditing(n)} /> : null}
                </header>
                <p className={styles.plain}>{n.text}</p>
              </li>
            ))}
          </ul>
          <ListPagination data={list.data} onChange={setPage} />
        </>
      )}
      {creating || editing ? (
        <NoteDialog
          key={editing?.id ?? "new"}
          base={base}
          note={editing}
          close={() => {
            setEditing(null);
            onCreatingChange(false);
          }}
        />
      ) : null}
    </div>
  );
}

function NoteDialog({ base, note, close }: { base: string; note: Note | null; close: () => void }) {
  const uiCopy = useUiCopy();

  const [title, setTitle] = useState(note?.title ?? "");
  const [text, setText] = useState(note?.text ?? "");
  const mutation = useCoachingMutation(close);
  return (
    <Dialog isOpen title={note ? uiCopy["ui"]["Edit private note"] : uiCopy["ui"]["New private note"]} onOpenChange={(open) => { if (!open && !mutation.isPending) close(); }}>
      <form
        className={styles.form}
        onSubmit={(e) => {
          e.preventDefault();
          mutation.mutate({ method: note ? "PATCH" : "POST", path: `${base}/notes${note ? `/${note.id}` : ""}`, ifMatch: note?.version, json: { text, title } });
        }}
      >
        <TextField label={uiCopy["ui"]["Note title"]} placeholder={uiCopy["ui"]["e.g. Knee feels better after deloads"]} value={title} onChange={setTitle} maxLength={200} isRequired autoFocus />
        <TextArea label={uiCopy["video"]["new"]["note"]} placeholder={uiCopy["ui"]["Write what you want to remember about this client…"]} value={text} onChange={setText} maxLength={20000} isRequired />
        <MutationError error={mutation.error} />
        <DialogFooter>
          <Button onPress={close} isDisabled={mutation.isPending}>{uiCopy["common"]["cancel"]}</Button>
          <Button type="submit" variant="primary" loading={mutation.isPending} isDisabled={!text.trim() || !title.trim()}>{uiCopy["ui"]["Save note"]}</Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ photos and files */

const kindOf = (d: Document) => (!d.hasFile ? "TXT" : d.contentType?.startsWith("image/") ? (d.contentType.split("/")[1] ?? "IMG").toUpperCase().slice(0, 4) : d.contentType === "application/pdf" ? "PDF" : "FILE");
const sizeOf = (size: Document["size"]) => (size == null ? null : Number(size) > 1_000_000 ? `${(Number(size) / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(Number(size) / 1000))} KB`);

function Documents({ base, canWrite, coach, search, category, creating, onCreatingChange }: { base: string; canWrite: boolean; coach: boolean; search: string; category: string; creating: boolean; onCreatingChange: (open: boolean) => void }) {
  const uiCopy = useUiCopy();

  const photos = category === "ProgressPhoto";
  const [removing, setRemoving] = useState<Document | null>(null);
  const [editing, setEditing] = useState<Document | null>(null);
  const [viewing, setViewing] = useState<Document | null>(null);
  const [page, setPage] = useState(1);
  const list = useCoachingQuery<Page<Document>>(`${base}/documents`, { search, category: category === "All" ? undefined : category, page, pageSize: 12 });
  const share = useCoachingMutation();
  const remove = useCoachingMutation(() => setRemoving(null));
  const onAction = (d: Document, key: React.Key) => {
    if (key === "edit") setEditing(d);
    else if (key === "view") setViewing(d);
    else if (key === "share") share.mutate({ method: "POST", path: `${base}/documents/${d.id}/share`, ifMatch: d.version, json: { visibility: d.visibility === "CoachPrivate" ? "SharedWithClient" : "CoachPrivate" } });
    else if (key === "delete") setRemoving(d);
  };
  const menu = (d: Document) => {
    const canEditDoc = d.allowedActions.includes("edit");
    const canShare = d.allowedActions.includes("share");
    const canDelete = d.allowedActions.includes("delete");
    if (!canEditDoc && !canShare && !canDelete && d.hasFile) return null;
    return (
      <DropdownMenuTrigger>
        <IconButton size="sm" label={formatInterfaceText(uiCopy["ui"]["Actions for {0}"], [d.title])} icon={<MoreHorizontal />} />
        <DropdownMenu aria-label={formatInterfaceText(uiCopy["ui"]["Actions for {0}"], [d.title])} onAction={(key) => onAction(d, key)}>
          {!d.hasFile ? <DropdownMenuItem id="view">{uiCopy["common"]["open"]}</DropdownMenuItem> : null}
          {canEditDoc ? <DropdownMenuItem id="edit">{uiCopy["video"]["detail"]["editDetails"]}</DropdownMenuItem> : null}
          {canShare ? <DropdownMenuItem id="share">{d.visibility === "CoachPrivate" ? (coach ? uiCopy["ui"]["Share with client"] : uiCopy["ui"]["Share with coach"]) : uiCopy["ui"]["Make visible only to me"]}</DropdownMenuItem> : null}
          {canDelete ? <DropdownMenuSeparator /> : null}
          {canDelete ? <DropdownMenuItem id="delete" tone="danger">{uiCopy["ui"]["Delete document"]}</DropdownMenuItem> : null}
        </DropdownMenu>
      </DropdownMenuTrigger>
    );
  };
  const visibility = (d: Document) => (d.visibility === "CoachPrivate" ? <Badge size="sm">{uiCopy["ui"]["Only me"]}</Badge> : <Badge size="sm" tone="success">{coach ? uiCopy["ui"]["Shared with client"] : uiCopy["ui"]["Shared with coach"]}</Badge>);

  return (
    <div className={styles.stack}>
      <p className={styles.hint}>{uiCopy["ui"]["Your private files and shared files appear together here. Only you can see files marked Only me."]}</p>
      <MutationError error={share.error} />
      {list.isPending ? <Loading /> : list.isError ? <Failure error={list.error} /> : !list.data.items.length ? (
        <EmptyState
          icon={photos ? <ImageIcon /> : <FileText />}
          title={search ? uiCopy["ui"]["Nothing matches this search"] : photos ? uiCopy["ui"]["No progress photos available."] : uiCopy["ui"]["No documents available."]}
          description={photos ? uiCopy["ui"]["Progress photos for this collaboration appear here."] : uiCopy["ui"]["Files and text documents for this collaboration appear here."]}
        />
      ) : photos ? (
        <ul className={styles.gallery}>
          {list.data.items.map((d) => (
            <li key={`${d.id}:${d.version}`} className={styles.photoCard}>
              <PhotoThumb base={base} document={d} />
              <div className={styles.photoInfo}>
                <div className={styles.photoText}>
                  <strong>{d.title}</strong>
                  <span className={styles.meta}>{new Date(d.observedAt).toLocaleDateString()}{d.description ? ` · ${d.description}` : ""}</span>
                </div>
                {visibility(d)}
                {menu(d)}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <ul className={styles.files}>
          {list.data.items.map((d) => (
            <li key={`${d.id}:${d.version}`} className={styles.fileRow}>
              <span className={styles.glyph} aria-hidden="true">{kindOf(d)}</span>
              <div className={styles.fileText}>
                {d.hasFile ? <DownloadLink base={base} document={d} /> : <button type="button" className={styles.fileName} onClick={() => setViewing(d)}>{d.title}</button>}
                <span className={styles.meta}>
                  {[new Date(d.observedAt).toLocaleDateString(), d.category, sizeOf(d.size), d.description].filter(Boolean).join(" · ")}
                </span>
              </div>
              {visibility(d)}
              {menu(d)}
            </li>
          ))}
        </ul>
      )}
      {list.data && Number(list.data.total) > Number(list.data.pageSize) ? <ListPagination data={list.data} onChange={setPage} /> : null}
      {canWrite && (creating || editing) ? (
        <DocumentDialog
          key={editing?.id ?? "new"}
          base={base}
          coach={coach}
          photos={photos}
          document={editing}
          close={() => {
            setEditing(null);
            onCreatingChange(false);
          }}
        />
      ) : null}
      {viewing ? (
        <Dialog isOpen title={viewing.title} description={new Date(viewing.observedAt).toLocaleDateString()} onOpenChange={(open) => { if (!open) setViewing(null); }}>
          {viewing.description ? <p className={styles.hint}>{viewing.description}</p> : null}
          <p className={styles.plain}>{viewing.text}</p>
        </Dialog>
      ) : null}
      <AlertDialog
        isOpen={removing !== null}
        onOpenChange={(open) => { if (!open && !remove.isPending) setRemoving(null); }}
        title={uiCopy["ui"]["Delete this document?"]}
        tone="danger"
        confirmLabel={uiCopy["ui"]["Delete document"]}
        cancelLabel={uiCopy["ui"]["Keep document"]}
        isConfirming={remove.isPending}
        onConfirm={() => { if (removing) remove.mutate({ method: "DELETE", path: `${base}/documents/${removing.id}`, ifMatch: removing.version }); }}
      >

        {uiCopy["ui"]["The document will disappear from this relationship and new file access will be blocked. Retained records and private storage are not permanently erased."]}
        <MutationError error={remove.error} />
      </AlertDialog>
    </div>
  );
}

function useReadUrl(base: string, document: Document, enabled: boolean) {
  const api = useApi();
  const account = useAccountKey();
  return useQuery({
    queryKey: [account, "documentation-read-url", document.id, document.version],
    enabled,
    staleTime: 0,
    refetchInterval: (query) => query.state.status !== "error" && query.state.data ? Math.max(1000, Date.parse(query.state.data.expiresAt) - Date.now() - 5000) : false,
    retry: false,
    queryFn: async () => (await api<{ url: string; expiresAt: string }>({ method: "POST", path: `${base}/documents/${document.id}/read-url` })).data,
  });
}

function PhotoThumb({ base, document }: { base: string; document: Document }) {
 const uiCopy = useUiCopy();

  const read = useReadUrl(base, document, document.hasFile);
  const [expired, setExpired] = useState(true);
  useEffect(() => {
    const remaining = read.data ? Date.parse(read.data.expiresAt) - Date.now() : 0;
    setExpired(!(remaining > 0));
    if (!(remaining > 0)) return;
    const timer = window.setTimeout(() => setExpired(true), remaining);
    return () => window.clearTimeout(timer);
  }, [read.data]);
  return (
    <div className={styles.thumb}>
      {read.data && !expired ? (
        <a href={read.data.url} target="_blank" rel="noreferrer" aria-label={formatInterfaceText(uiCopy["ui"]["Open {0}"], [document.title])}>
          <img src={read.data.url} alt={document.description || document.title} loading="lazy" />
        </a>
      ) : (
        <span className={styles.thumbEmpty} aria-hidden="true">
          <ImageIcon />
        </span>
      )}
    </div>
  );
}

function DownloadLink({ base, document }: { base: string; document: Document }) {
 const uiCopy = useUiCopy();

  const { api, lifecycle } = useAccountContext();
  const open = useMutation({
    mutationFn: async () => (await api<{ url: string }>({ method: "POST", path: `${base}/documents/${document.id}/read-url` })).data,
    onSuccess: (data) => { if (lifecycle.isCurrent()) window.open(data.url, "_blank", "noopener"); },
  });
  return (
    <button type="button" className={styles.fileName} onClick={() => open.mutate()} aria-busy={open.isPending || undefined} title={uiCopy["ui"]["Open file (temporary link)"]}>
      {document.title}
    </button>
  );
}

function DocumentDialog({ base, coach, photos, document, close }: { base: string; coach: boolean; photos: boolean; document: Document | null; close: () => void }) {
  const uiCopy = useUiCopy();

  const [title, setTitle] = useState(document?.title ?? "");
  const [description, setDescription] = useState(document?.description ?? "");
  const [text, setText] = useState(document?.text ?? "");
  const [category, setCategory] = useState(document?.category ?? (photos ? "ProgressPhoto" : "General"));
  const [visibility, setVisibility] = useState("CoachPrivate");
  const [observed, setObserved] = useState(document ? document.observedAt.slice(0, 10) : today());
  const [file, setFile] = useState<File | null>(null);
  const [uploadId, setUploadId] = useState<string | null>(null);
  const { api, lifecycle } = useAccountContext();
  const account = useAccountKey();
  const cache = useQueryClient();
  const save = useMutation({
    mutationFn: async () => {
      let mediaId = uploadId;
      if (file && !mediaId) {
        const ticket = (await api<Upload>({ method: "POST", path: `${base}/uploads`, json: { name: file.name, contentType: file.type || "application/octet-stream", size: file.size } })).data;
        const result = await fetch(ticket.uploadUrl, { method: ticket.method, headers: { "Content-Type": file.type, "x-upsert": "false" }, body: file, signal: lifecycle.signal() });
        if (!result.ok) throw new Error("Upload failed. Retry the upload or choose another file.");
        await api({ method: "POST", path: `${base}/uploads/${ticket.mediaId}/finalize` });
        mediaId = ticket.mediaId;
        if (!lifecycle.isCurrent()) return;
        setUploadId(mediaId);
      }
      await api({
        method: document ? "PATCH" : "POST",
        path: `${base}/documents${document ? `/${document.id}` : ""}`,
        ifMatch: document?.version,
        json: { title, description: description || null, category, observedAt: iso(observed), text: document?.hasFile || mediaId ? null : text, ...(!document ? { mediaId, visibility } : {}) },
      });
    },
    onSuccess: async () => {
      if (!lifecycle.isCurrent()) return;
      await cache.invalidateQueries({ queryKey: [account, "coaching"] });
      if (lifecycle.isCurrent()) close();
    },
  });
  const needsText = !photos && !file && !document?.hasFile;
  return (
    <Dialog
      isOpen
      title={document ? uiCopy["ui"]["Edit document"] : photos ? uiCopy["ui"]["Add progress photo"] : uiCopy["ui"]["Add document or file"]}
      onOpenChange={(open) => { if (!open && !save.isPending) close(); }}
    >
      <form className={styles.form} onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
        {!document ? (
          <label className={styles.drop}>
            <input key={file?.name ?? "empty"} type="file" accept={photos ? "image/png,image/jpeg,image/webp" : "image/png,image/jpeg,image/webp,application/pdf,text/plain"} onChange={(e) => { setFile(e.target.files?.[0] ?? null); setUploadId(null); }} />
            <span className={styles.dropTitle}>{file ? file.name : photos ? uiCopy["ui"]["Choose a photo"] : uiCopy["ui"]["Choose a file (optional)"]}</span>
            <span className={styles.meta}>{photos ? uiCopy["ui"]["PNG, JPEG or WebP"] : uiCopy["ui"]["PDF, image or text — leave empty to write a text document"]}</span>
          </label>
        ) : null}
        <TextField label={uiCopy["profile"]["showcase"]["fileTitle"]} placeholder={photos ? uiCopy["ui"]["e.g. Front pose, week 4"] : uiCopy["ui"]["e.g. Blood test results"]} value={title} onChange={setTitle} maxLength={200} isRequired autoFocus />
        <TextArea label={photos ? uiCopy["ui"]["Caption"] : uiCopy["training"]["library"]["createDialog"]["description"]} placeholder={photos ? uiCopy["ui"]["Optional caption for this photo"] : uiCopy["ui"]["What this document is about"]} value={description} onChange={setDescription} maxLength={2000} />
        <div className={styles.pair}>
          <TextField label={uiCopy["ui"]["Observed date"]} type="date" value={observed} onChange={setObserved} isRequired />
          {!photos ? <TextField label={uiCopy["ui"]["Category"]} placeholder={uiCopy["ui"]["e.g. Medical"]} value={category} onChange={setCategory} maxLength={60} isRequired /> : null}
          {!document ? (
            <Select label={uiCopy["ui"]["Visibility"]} selectedKey={visibility} onSelectionChange={(v) => setVisibility(String(v))}>
              <Option id="CoachPrivate">{uiCopy["ui"]["Only me"]}</Option>
              <Option id="SharedWithClient">{coach ? uiCopy["ui"]["Shared with client"] : uiCopy["ui"]["Shared with coach"]}</Option>
            </Select>
          ) : null}
        </div>
        {needsText ? <TextArea label={uiCopy["ui"]["Document text"]} placeholder={uiCopy["ui"]["Paste or type the document content"]} value={text} onChange={setText} maxLength={50000} isRequired /> : null}
        {!coach ? <p className={styles.hint}>{uiCopy["ui"]["Client-provided files and text are shared with this relationship’s coach."]}</p> : null}
        <MutationError error={save.error} />
        <DialogFooter>
          <Button onPress={close} isDisabled={save.isPending}>{uiCopy["common"]["cancel"]}</Button>
          <Button type="submit" variant="primary" loading={save.isPending} isDisabled={!title.trim() || !observed || (photos && !document && !file) || (needsText && !text.trim())}>

            {uiCopy["ui"]["Save document"]}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
