import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Schema } from "@trainflow/api-client-web";
import { Alert, Button, Option, SearchInput, Select, TextArea, TextField } from "@trainflow/ui-web";
import { useAccountKey, useApi } from "~/shared/session/AccountScope";
import { useCoachingMutation, useCoachingQuery, type Page } from "~/modules/coaching";
import { Failure, ListPagination, Loading, MutationError } from "~/modules/coaching";
import { AreaChart } from "~/modules/analyze";
import styles from "./documentation.module.css";

type Access = Schema<"DocumentationAccess">;
type Definition = Schema<"MeasurementDefinition">;
type Measurement = Schema<"MeasurementDto">;
type Trend = Schema<"MeasurementTrend">;
type Note = Schema<"NoteDto">;
type Document = Schema<"DocumentDto">;
type Upload = Schema<"DocumentUpload">;
const today = () => new Date().toISOString().slice(0, 10);
const iso = (date: string) => date === today() ? new Date().toISOString() : new Date(`${date}T12:00:00Z`).toISOString();
const root = (id: string) => `/api/v1/coaching/relationships/${id}/documentation`;

export function RelationshipDocumentation({ relationshipId, clientView = false }: { relationshipId: string; clientView?: boolean }) {
  const account = useAccountKey();
  return <Documentation key={`${account}:${relationshipId}:${clientView}`} relationshipId={relationshipId} clientView={clientView} />;
}
function Documentation({ relationshipId, clientView }: { relationshipId: string; clientView: boolean }) {
  const [tab, setTab] = useState("measurements");
  const access = useCoachingQuery<Access>(`${root(relationshipId)}/`);
  if (access.isPending) return <Loading />;
  if (access.isError) return <Failure error={access.error} retry={() => void access.refetch()} />;
  const canWrite = access.data.allowedActions.includes("create");
  const coach = access.data.coach && !clientView;
  return <section className={styles.workspace} aria-label="Relationship documentation"><h2>Client documentation</h2><p>Records belong to this coaching relationship. Measurements are shared with your coach and client; document visibility is set separately.</p>
    {!canWrite && <Alert title={`${access.data.status} relationship — historical records are read-only.`} tone="info" />}
    <div className={styles.actions} role="group" aria-label="Documentation sections">{[["measurements", "Measurements"], ["photos", "Progress photos"], ["documents", "Documents"], ...(coach ? [["notes", "Private notes"]] : [])].map(([key, label]) => <Button key={key} variant={tab === key ? "primary" : "secondary"} onPress={() => setTab(key!)}>{label}</Button>)}</div>
    {tab === "measurements" ? <Measurements base={root(relationshipId)} canWrite={canWrite} /> : tab === "notes" && coach ? <Notes base={root(relationshipId)} canWrite={canWrite} /> : <Documents key={tab} base={root(relationshipId)} canWrite={canWrite} coach={coach} photos={tab === "photos"} />}
  </section>;
}
function Measurements({ base, canWrite }: { base: string; canWrite: boolean }) {
  const [key, setKey] = useState("weight"); const [unit, setUnit] = useState("kg"); const [value, setValue] = useState(""); const [observed, setObserved] = useState(today); const [comment, setComment] = useState(""); const [page, setPage] = useState(1);
  const [from, setFrom] = useState(() => new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10)); const [to, setTo] = useState(today);
  const definitions = useCoachingQuery<Definition[]>(`${base}/measurement-definitions`);
  const range = { from: `${from}T00:00:00Z`, to: `${to}T23:59:59Z` };
  const list = useCoachingQuery<Page<Measurement>>(`${base}/measurements`, { ...range, page, pageSize: 15 });
  const trend = useCoachingQuery<Trend>(`${base}/measurements/trend`, { ...range, key, unit });
  const mutation = useCoachingMutation(() => { setValue(""); setComment(""); });
  return <div className={styles.stack}><div className={styles.grid}>
    <TextField label="From date" type="date" value={from} onChange={(v) => { setFrom(v); setPage(1); }} /><TextField label="To date" type="date" value={to} onChange={(v) => { setTo(v); setPage(1); }} />
    <Select label="Measurement" selectedKey={key} onSelectionChange={(k) => { const d = definitions.data?.find((x) => x.key === k); if (d) { setKey(d.key); setUnit(d.units[0]!); } }}>{(definitions.data ?? []).map((d) => <Option id={d.key} key={d.key}>{d.label}</Option>)}</Select>
    <Select label="Unit" selectedKey={unit} onSelectionChange={(k) => setUnit(String(k))}>{(definitions.data?.find((d) => d.key === key)?.units ?? [unit]).map((u) => <Option id={u} key={u}>{u}</Option>)}</Select>
  </div>{definitions.isError && <Failure error={definitions.error} />}
    {trend.isPending ? <Loading /> : trend.isError ? <Failure error={trend.error} /> : <><AreaChart labels={trend.data.points.map((p) => p.observedAt.slice(0, 10))} series={[{ label: `${key} (${unit})`, tone: "info", values: trend.data.points.map((p) => Number(p.value)) }]} format={(n) => `${n.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${unit}`} /><p>Daily averages in UTC; only compatible units of the selected measurement are converted.</p></>}
    {canWrite && <form className={styles.panel} onSubmit={(e) => { e.preventDefault(); mutation.mutate({ method: "POST", path: `${base}/measurements`, json: { key, unit, value: Number(value), observedAt: iso(observed), comment: comment || null } }); }}><h3>Add measurement</h3><div className={styles.grid}><TextField label={`Value (${unit})`} type="number" value={value} onChange={setValue} isRequired /><TextField label="Observed date" type="date" value={observed} onChange={setObserved} isRequired /></div><TextArea label="Context / comment" value={comment} onChange={setComment} maxLength={2000} /><Button type="submit" loading={mutation.isPending} isDisabled={!value || !observed}>Save measurement</Button><MutationError error={mutation.error} /></form>}
    {list.isPending ? <Loading /> : list.isError ? <Failure error={list.error} /> : <>{!list.data.items.length ? <p>No measurements in this period.</p> : <ul className={styles.list}>{list.data.items.map((m) => <li key={m.id}><strong>{m.key}: {m.value} {m.unit}</strong> · {new Date(m.observedAt).toLocaleDateString()} · {m.source}{m.comment && <p>{m.comment}</p>}</li>)}</ul>}<ListPagination data={list.data} onChange={setPage} /></>}
  </div>;
}
function Notes({ base, canWrite }: { base: string; canWrite: boolean }) {
  const [search, setSearch] = useState(""); const [page, setPage] = useState(1); const [editing, setEditing] = useState<Note | null>(null); const [text, setText] = useState("");
  const list = useCoachingQuery<Page<Note>>(`${base}/notes`, { search, page, pageSize: 15 });
  const mutation = useCoachingMutation(() => { setText(""); setEditing(null); });
  return <div className={styles.stack}><p>Only this relationship’s coach can access these notes. Notes are never sent in notifications.</p><SearchInput aria-label="Search private notes" value={search} onChange={(v) => { setSearch(v); setPage(1); }} />
    {canWrite && <form className={styles.panel} onSubmit={(e) => { e.preventDefault(); mutation.mutate({ method: editing ? "PATCH" : "POST", path: `${base}/notes${editing ? `/${editing.id}` : ""}`, ifMatch: editing?.version, json: { text } }); }}><TextArea label={editing ? "Edit private note" : "New private note"} value={text} onChange={setText} maxLength={20000} isRequired /><div className={styles.actions}><Button type="submit" loading={mutation.isPending} isDisabled={!text.trim()}>Save note</Button>{editing && <Button onPress={() => { setEditing(null); setText(""); }}>Cancel edit</Button>}</div><MutationError error={mutation.error} /></form>}
    {list.isPending ? <Loading /> : list.isError ? <Failure error={list.error} /> : <>{!list.data.items.length && <p>No private notes.</p>}{list.data.items.map((n) => <article key={n.id} className={styles.panel}><time>{new Date(n.updatedAt).toLocaleString()}</time><p className={styles.plain}>{n.text}</p>{canWrite && <Button onPress={() => { setEditing(n); setText(n.text); }}>Edit note</Button>}</article>)}<ListPagination data={list.data} onChange={setPage} /></>}
  </div>;
}
function Documents({ base, canWrite, coach, photos }: { base: string; canWrite: boolean; coach: boolean; photos: boolean }) {
  const [search, setSearch] = useState(""); const [page, setPage] = useState(1); const [editing, setEditing] = useState<Document | null>(null); const [title, setTitle] = useState(""); const [description, setDescription] = useState(""); const [text, setText] = useState(""); const [category, setCategory] = useState(photos ? "ProgressPhoto" : "General"); const [visibility, setVisibility] = useState(coach ? "CoachPrivate" : "SharedWithClient"); const [observed, setObserved] = useState(today); const [file, setFile] = useState<File | null>(null); const [uploadId, setUploadId] = useState<string | null>(null);
  const api = useApi(); const account = useAccountKey(); const cache = useQueryClient();
  const list = useCoachingQuery<Page<Document>>(`${base}/documents`, { search, category: photos ? "ProgressPhoto" : undefined, page, pageSize: 12 });
  const reset = () => { setEditing(null); setTitle(""); setDescription(""); setText(""); setFile(null); setUploadId(null); };
  const save = useMutation({ mutationFn: async () => {
    let mediaId = uploadId;
    if (file && !mediaId) {
      const ticket = (await api<Upload>({ method: "POST", path: `${base}/uploads`, json: { name: file.name, contentType: file.type || "application/octet-stream", size: file.size } })).data;
      const result = await fetch(ticket.uploadUrl, { method: ticket.method, headers: { "Content-Type": file.type, "x-upsert": "false" }, body: file });
      if (!result.ok) throw new Error("Upload failed. Retry the upload or choose another file.");
      await api({ method: "POST", path: `${base}/uploads/${ticket.mediaId}/finalize` });
      mediaId = ticket.mediaId; setUploadId(mediaId);
    }
    await api({ method: editing ? "PATCH" : "POST", path: `${base}/documents${editing ? `/${editing.id}` : ""}`, ifMatch: editing?.version, json: { title, description: description || null, category, observedAt: iso(observed), text: (editing?.hasFile || mediaId) ? null : text, ...(!editing ? { mediaId, visibility } : {}) } });
  }, onSuccess: async () => { reset(); await cache.invalidateQueries({ queryKey: [account, "coaching"] }); } });
  const share = useCoachingMutation();
  return <div className={styles.stack}><SearchInput aria-label={photos ? "Search progress photos" : "Search documents"} value={search} onChange={(v) => { setSearch(v); setPage(1); }} />
    {canWrite && <form className={styles.panel} onSubmit={(e) => { e.preventDefault(); save.mutate(); }}><h3>{editing ? "Edit document" : photos ? "Add progress photo" : "Add document or file"}</h3><TextField label="Title" value={title} onChange={setTitle} maxLength={200} isRequired /><TextArea label="Description / caption" value={description} onChange={setDescription} maxLength={2000} /><div className={styles.grid}><TextField label="Observed date" type="date" value={observed} onChange={setObserved} isRequired />{!photos && <TextField label="Category" value={category} onChange={setCategory} maxLength={60} isRequired />}{coach && !editing && <Select label="Visibility" selectedKey={visibility} onSelectionChange={(v) => setVisibility(String(v))}><Option id="CoachPrivate">Private to coach</Option><Option id="SharedWithClient">Shared with client</Option></Select>}</div>
      {!editing && <label className={styles.file}>{photos ? "Photo" : "Optional file (leave empty for a text document)"}<input key={file?.name ?? "empty"} type="file" accept={photos ? "image/png,image/jpeg,image/webp" : "image/png,image/jpeg,image/webp,application/pdf,text/plain"} onChange={(e) => { setFile(e.target.files?.[0] ?? null); setUploadId(null); }} /></label>}
      {!photos && !file && !editing?.hasFile && <TextArea label="Document text" value={text} onChange={setText} maxLength={50000} isRequired />}
      {!coach && <p>Client-provided files and text are shared with this relationship’s coach.</p>}
      <div className={styles.actions}><Button type="submit" loading={save.isPending} isDisabled={!title.trim() || !observed || (!editing?.hasFile && !file && !text.trim())}>Save document</Button>{editing && <Button onPress={reset}>Cancel edit</Button>}</div><MutationError error={save.error} />
    </form>}
    <MutationError error={share.error} />
    {list.isPending ? <Loading /> : list.isError ? <Failure error={list.error} /> : <>{!list.data.items.length && <p>{photos ? "No progress photos available." : "No documents available."}</p>}<div className={photos ? styles.gallery : styles.stack}>{list.data.items.map((d) => <article key={`${d.id}:${d.version}`} className={styles.panel}><h3>{d.title}</h3><p>{new Date(d.observedAt).toLocaleDateString()} · {d.source} · {d.visibility === "CoachPrivate" ? "Private to coach" : "Shared with client"}</p>{d.description && <p>{d.description}</p>}{d.text && <p className={styles.plain}>{d.text}</p>}{d.hasFile && <FilePreview base={base} document={d} photo={photos} />}<div className={styles.actions}>{d.allowedActions.includes("edit") && <Button onPress={() => { setEditing(d); setTitle(d.title); setDescription(d.description ?? ""); setText(d.text ?? ""); setCategory(d.category); setObserved(d.observedAt.slice(0, 10)); setFile(null); setUploadId(null); }}>Edit document</Button>}{coach && d.allowedActions.includes("share") && <Button isDisabled={share.isPending} onPress={() => share.mutate({ method: "POST", path: `${base}/documents/${d.id}/share`, ifMatch: d.version, json: { visibility: d.visibility === "CoachPrivate" ? "SharedWithClient" : "CoachPrivate" } })}>{d.visibility === "CoachPrivate" ? "Share with client" : "Make private"}</Button>}</div></article>)}</div><ListPagination data={list.data} onChange={setPage} /></>}
  </div>;
}
function FilePreview({ base, document, photo }: { base: string; document: Document; photo: boolean }) {
  const api = useApi();
  const read = useMutation({ mutationFn: async () => (await api<{ url: string; expiresAt: string }>({ method: "POST", path: `${base}/documents/${document.id}/read-url` })).data });
  return <div className={styles.stack}><Button loading={read.isPending} onPress={() => read.mutate()}>{photo ? "Load photo" : "Get private download link"}</Button><MutationError error={read.error} />{read.data && (photo ? <img className={styles.photo} src={read.data.url} alt={document.description || document.title} /> : <a href={read.data.url} target="_blank" rel="noreferrer">Open file (temporary link)</a>)}</div>;
}
