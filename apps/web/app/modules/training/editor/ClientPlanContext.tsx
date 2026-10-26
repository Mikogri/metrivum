import { useEffect, useRef, useState } from "react";
import { UserSearch, Users } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Button, Combobox, Dialog, DialogFooter, Hint, NumberInput, Option, SearchInput, TextField, toast } from "@trainflow/ui-web";
import { Failure, ListPagination, useCoachingQuery, type Page, type Relationship } from "~/modules/coaching";
import { ExercisePicker, useExerciseNames } from "~/modules/exercises";
import { useDebounced } from "~/shared/lib/useDebounced";
import { useAccountContext, useAccountKey, useApi } from "~/shared/session/AccountScope";
import { AssignProgramButton, localDate, type Assignment } from "../delivery/Assignments";
import type { ClientFormulaContextValue } from "./client-context";
import { sourcesChanged, validMax, type ClientVariables, type ExerciseMax, type FormulaSnapshot } from "./client-metrics";
import styles from "./ClientPlanContext.module.css";

const base = "/api/v1/training";
type PlanClient = { id: string; client: { displayName?: string | null; username?: string | null } };
const nameOf = (client: PlanClient) => client.client.displayName || client.client.username || "Client";

/** The selector is a preview context. Assignment only happens through the existing explicit flow. */
export function usePlanClientContext(programId: string, enabled: boolean) {
  const account = useAccountKey();
  const [client, setClient] = useState<PlanClient | null>(null);
  const [search, setSearch] = useState("");
  const [metricsOpen, setMetricsOpen] = useState(false);
  const [assignedOpen, setAssignedOpen] = useState(false);
  const [page, setPage] = useState(1);
  const term = useDebounced(search, 200);
  const clients = useCoachingQuery<Page<Relationship>>("/api/v1/coaching/clients", { search: term || undefined, status: "Active", pageSize: 30 }, enabled);
  const assignments = useCoachingQuery<Page<Assignment>>(`${base}/assignments`, { programId, page, pageSize: 20, view: "coach" }, enabled);
  const selectedAssignments = useCoachingQuery<Page<Assignment>>(`${base}/assignments`, { programId, relationshipId: client?.id, pageSize: 100, view: "coach" }, enabled && Boolean(client));
  const assigned = selectedAssignments.data?.items.find(item => item.status === "Active" || item.status === "Paused");
  const [value, setValue] = useState<ClientFormulaContextValue>({ variables: {}, sourceVersions: {}, isStale: false });
  // A newly selected client must never briefly inherit the previous client's measurements.
  const selectedValue = value.relationshipId === client?.id ? value : { variables: {}, sourceVersions: {}, isStale: false, isLoading: Boolean(client) };
  const selectionMade = useRef(false);
  useEffect(() => {
    if (!enabled || selectionMade.current || !assignments.data) return;
    selectionMade.current = true;
    const first = assignments.data.items.find(item => item.status === "Active" || item.status === "Paused");
    if (first) { const next = { id: first.relationshipId, client: { displayName: first.clientDisplayName, username: first.clientUsername } }; setClient(next); setSearch(nameOf(next)); }
  }, [enabled, assignments.data]);
  const choose = (next: PlanClient | null) => { selectionMade.current = true; setClient(next); setSearch(next ? nameOf(next) : ""); };
  const toolbar = enabled ? <div className={styles.context}>
    <div className={styles.joined}>
    <Combobox size="sm" aria-label="Client perspective" placeholder="View as…" inputValue={search} onInputChange={setSearch}
      selectedKey={client?.id ?? null} onSelectionChange={key => { const next = clients.data?.items.find(item => item.id === key); if (next) choose(next); }}
      defaultFilter={() => true} menuTrigger="input" allowsEmptyCollection menuWidth="sm" className={styles.picker}
      emptyState={<span className={styles.pickerEmpty}>
        <UserSearch aria-hidden="true" />
        {clients.isLoading || term !== search ? <strong>Loading clients…</strong>
          : clients.isError ? <><strong>Couldn't load clients</strong><span>Try again in a moment.</span></>
          : term ? <><strong>No clients match “{term}”</strong><span>Only active clients can be previewed.</span></>
          : <><strong>No active clients yet</strong><span>Once a client joins, you can see the plan as they will.</span></>}
      </span>}>
      {[...(client && !clients.data?.items.some(item => item.id === client.id) ? [client] : []), ...(clients.data?.items ?? [])].map(item => <Option key={item.id} id={item.id} textValue={nameOf(item)}>{nameOf(item)}{item.client.username ? ` · @${item.client.username}` : ""}</Option>)}
    </Combobox>
    <Hint label="Assigned clients"><Button size="sm" variant="secondary" iconStart={<Users />} aria-label={`Assigned clients${assignments.data ? `: ${assignments.data.total}` : ""}`} onPress={() => setAssignedOpen(true)}>{assignments.data ? assignments.data.total : "–"}</Button></Hint>
    </div>
    {client ? <Button size="sm" variant="ghost" onPress={() => choose(null)}>Template view</Button> : null}
    
    <AssignProgramButton programId={programId} size="sm" />
    {client ? <Button size="sm" onPress={() => setMetricsOpen(true)}>Client data</Button> : null}
  </div> : null;
  const banners = enabled && client ? <SelectedClient key={`${account}:${programId}:${client.id}:${assigned?.id ?? "preview"}`} programId={programId} client={client}
    assignment={assigned} loadingAssignment={selectedAssignments.isPending} onValue={setValue} /> : null;
  const dialogs = <>
    <Dialog title="Assigned clients" isOpen={assignedOpen} onOpenChange={setAssignedOpen} size="md">
      <div className={styles.stack}>
        <p>Choose a client to preview their frozen values. Use the search beside the plan name to preview an unassigned client.</p>
        {assignments.isError ? <Failure error={assignments.error} retry={() => void assignments.refetch()} /> : null}
        {(assignments.data?.items ?? []).map(item => <AssignedClient key={item.id} assignment={item} onChoose={next => { choose(next); setAssignedOpen(false); }} />)}
        {assignments.data && assignments.data.total === 0 ? <Alert tone="info" title="No clients have this program yet">Assign the program from its page (Assign program), then preview each client's values here.</Alert> : null}
        {assignments.data ? <ListPagination data={assignments.data} onChange={setPage} /> : null}
      </div>
    </Dialog>
    {client && metricsOpen ? <ClientMetrics key={`${account}:${client.id}`} relationshipId={client.id} title={nameOf(client)} onClose={() => setMetricsOpen(false)} /> : null}
  </>;
  return { value: selectedValue, toolbar, banners, dialogs };
}

function AssignedClient({ assignment, onChoose }: { assignment: Assignment; onChoose: (client: PlanClient) => void }) {
  const client = { id: assignment.relationshipId, client: { displayName: assignment.clientDisplayName, username: assignment.clientUsername } };
  return <Button variant="ghost" onPress={() => onChoose(client)}>{nameOf(client)} · {assignment.status}</Button>;
}

function useVariables(relationshipId: string) {
  const api = useApi();
  const account = useAccountKey();
  return useQuery({ queryKey: [account, "training", "client-variables", relationshipId], queryFn: async ({ signal }) => (await api<ClientVariables>({ path: `${base}/clients/${relationshipId}/variables`, signal })).data });
}

function SelectedClient({ client, assignment, loadingAssignment, onValue }: {
  programId: string; client: PlanClient; assignment?: Assignment; loadingAssignment: boolean; onValue: (value: ClientFormulaContextValue) => void;
}) {
  const api = useApi();
  const account = useAccountKey();
  const cache = useQueryClient();
  const { lifecycle } = useAccountContext();
  const current = useVariables(client.id);
  const [frozen, setFrozen] = useState<ClientVariables | null>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const snapshot = useQuery({ queryKey: [account, "training", "formula-snapshot", assignment?.id], enabled: Boolean(assignment),
    queryFn: async ({ signal }) => (await api<FormulaSnapshot>({ path: `${base}/assignments/${assignment!.id}/formula-snapshot`, signal })).data });
  useEffect(() => { if (current.data) setFrozen(previous => previous ?? current.data); }, [current.data]);
  const saved = assignment ? snapshot.data : frozen;
  const stale = Boolean(assignment ? snapshot.data?.stale : frozen && current.data && sourcesChanged(frozen.sourceVersions, current.data.sourceVersions));
  useEffect(() => {
    onValue({ relationshipId: client.id, variables: saved?.variables ?? {}, sourceVersions: saved?.sourceVersions ?? {}, isStale: stale,
      isLoading: loadingAssignment || current.isPending || Boolean(assignment && snapshot.isPending) });
  }, [client.id, saved, stale, onValue, assignment, snapshot.isPending, loadingAssignment, current.isPending]);
  const refresh = useMutation({ mutationFn: async () => {
    if (!assignment) return null;
    const preview = (await api<FormulaSnapshot>({ method: "POST", path: `${base}/assignments/${assignment.id}/formula-snapshot/preview` })).data;
    return (await api<FormulaSnapshot>({ method: "POST", path: `${base}/assignments/${assignment.id}/formula-snapshot/refresh`, ifMatch: assignment.version,
      json: { sourceVersions: preview.sourceVersions } })).data;
  }, onSuccess: result => {
    if (!mounted.current || !lifecycle.isCurrent()) return;
    if (result && assignment) cache.setQueryData([account, "training", "formula-snapshot", assignment.id], result);
    else if (current.data) setFrozen(current.data);
    void cache.invalidateQueries({ queryKey: [account, "coaching"] });
    toast({ tone: "success", title: "Client values updated. Started and completed workouts keep their history." });
  }, onError: () => { if (mounted.current && lifecycle.isCurrent()) toast({ tone: "danger", title: "Could not update client values. Reload and try again." }); } });
  return <div className={styles.notice}>
    <span>{nameOf(client)} · {assignment ? "Assigned client · saved values" : "Preview only · not assigned"}</span>
    {!assignment && !loadingAssignment ? <span>Previewing does not assign this plan or change its draft.</span> : null}
    {current.isError || snapshot.isError ? <Alert tone="danger" title="Client formula values could not be loaded." /> : null}
    {stale ? <Alert tone="warning" title="New client data available. This plan still uses its saved values.">
      <Button size="sm" loading={refresh.isPending} onPress={() => refresh.mutate()} isDisabled={!current.data}>Recalculate with latest data</Button>
    </Alert> : null}
    {!stale && current.data && Object.entries(current.data.sourceVersions).some(([name, version]) => saved?.sourceVersions[name] !== version) ?
      <Button size="sm" loading={refresh.isPending} onPress={() => refresh.mutate()}>Load latest variables</Button> : null}
  </div>;
}

function ClientMetrics({ relationshipId, title, onClose }: { relationshipId: string; title: string; onClose: () => void }) {
  const api = useApi();
  const account = useAccountKey();
  const { lifecycle } = useAccountContext();
  const cache = useQueryClient();
  const values = useVariables(relationshipId);
  const [editing, setEditing] = useState<ExerciseMax | null>(null);
  const [exercise, setExercise] = useState<{ id: string; name: string } | null>(null);
  const [picker, setPicker] = useState(false);
  const [reps, setReps] = useState(1);
  const [load, setLoad] = useState(NaN);
  const [unit, setUnit] = useState<"Kg" | "Lb">("Kg");
  const [alias, setAlias] = useState("");
  const [recordedOn, setRecordedOn] = useState(localDate());
  const [filter, setFilter] = useState("");
  const names = useExerciseNames((values.data?.exerciseMaxes ?? []).map(item => item.exerciseId));
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const reset = () => { setEditing(null); setExercise(null); setAlias(""); setLoad(NaN); setReps(1); setRecordedOn(localDate()); };
  const save = useMutation({ mutationFn: async () => {
    if (!exercise || !validMax(reps, load, alias) || !recordedOn) throw new Error("Choose an exercise, positive weight, 1–100 reps and a valid variable name.");
    return api({ path: `${base}/clients/${relationshipId}/exercise-maxes${editing ? `/${editing.id}` : ""}`, method: editing ? "PUT" : "POST", ifMatch: editing?.version,
      json: { exerciseId: exercise.id, reps, load: { value: load, unit }, recordedOn, alias } });
  }, onSuccess: () => {
    if (!mounted.current || !lifecycle.isCurrent()) return;
    reset();
    void cache.invalidateQueries({ queryKey: [account, "training", "client-variables", relationshipId] });
    void cache.invalidateQueries({ queryKey: [account, "training", "formula-snapshot"] });
    toast({ tone: "success", title: "Client result saved. Existing plan values were not changed." });
  }, onError: error => { if (mounted.current && lifecycle.isCurrent()) toast({ tone: "danger", title: error instanceof Error ? error.message : "Could not save this result." }); } });
  return <Dialog title={`${title} · Client data`} size="lg" isOpen onOpenChange={open => { if (!open && !save.isPending) onClose(); }}>
    <div className={styles.stack}>
      <p>Enter a measured result for an exercise and repetition count. Variable names can be used directly in formulas. Saving a new result does not recalculate existing plans.</p>
      {values.isError ? <Failure error={values.error} retry={() => void values.refetch()} /> : null}
      <dl className={styles.variables}>{Object.entries(values.data?.variables ?? {}).filter(([name]) => ["weight", "height", "hrMax"].includes(name)).map(([name, quantity]) => <div key={name}><dt>{name}</dt><dd>{quantity.value} {name === "height" ? "cm" : name === "hrMax" ? "bpm" : "kg"}</dd></div>)}</dl>
      <SearchInput aria-label="Search exercise results" placeholder="Search variable or exercise" value={filter} onChange={setFilter} />
      <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Exercise</th><th>Reps</th><th>Result</th><th>Variable</th><th>Date</th><th><span className="tf-visually-hidden">Actions</span></th></tr></thead>
        <tbody>{(values.data?.exerciseMaxes ?? []).filter(item => `${item.alias} ${names.get(item.exerciseId)?.name ?? ""}`.toLowerCase().includes(filter.toLowerCase())).map(item => <tr key={item.id}>
          <td>{names.get(item.exerciseId)?.name ?? "Exercise"}</td><td>{item.reps}</td><td>{item.load.value} {item.load.unit === "Lb" ? "lb" : "kg"}</td><td><code>{item.alias}</code></td><td>{item.recordedOn}</td>
          <td><Button size="sm" variant="ghost" onPress={() => { setEditing(item); setExercise({ id: item.exerciseId, name: names.get(item.exerciseId)?.name ?? "Exercise" }); setAlias(item.alias); setReps(item.reps); setLoad(Number(item.load.value)); setUnit(item.load.unit === "Lb" ? "Lb" : "Kg"); setRecordedOn(item.recordedOn); }}>Edit</Button></td>
        </tr>)}</tbody></table></div>
      {!values.isPending && values.data?.exerciseMaxes.length === 0 ? <p className={styles.hint}>No exercise results yet. Add the first one below — formulas that use this client's maxes need it.</p> : null}
      <form className={styles.form} onSubmit={event => { event.preventDefault(); if (!save.isPending) save.mutate(); }}>
        <h3>{editing ? "Edit result" : "Add result"}</h3>
        <Button onPress={() => setPicker(true)}>{exercise?.name ?? "Choose exercise"}</Button>
        <div className={styles.fields}><NumberInput label="Repetitions" value={reps} onChange={setReps} minValue={1} maxValue={100} step={1} />
          <NumberInput label="Weight" value={load} onChange={setLoad} minValue={0.01} />
          <label>Unit<select value={unit} onChange={event => setUnit(event.target.value as "Kg" | "Lb")}><option value="Kg">kg</option><option value="Lb">lb</option></select></label>
        </div>
        <TextField label="Variable name" placeholder="maxBench1r" value={alias} onChange={setAlias} maxLength={64} description="Letters, numbers and underscores; start with a letter or underscore." />
        <TextField label="Measured on" type="date" value={recordedOn} onChange={setRecordedOn} />
        <DialogFooter>{editing ? <Button onPress={reset}>Cancel edit</Button> : null}<Button type="submit" variant="primary" loading={save.isPending} isDisabled={!exercise || !validMax(reps, load, alias) || !recordedOn}>Save result</Button></DialogFooter>
      </form>
      <ExercisePicker isOpen={picker} onOpenChange={setPicker} selectedId={exercise?.id} onPick={item => { setExercise({ id: item.id, name: item.name }); if (!alias) setAlias(`max${item.name.replace(/[^A-Za-z0-9]/g, "").slice(0, 48)}${reps}r`); }} />
    </div>
  </Dialog>;
}
