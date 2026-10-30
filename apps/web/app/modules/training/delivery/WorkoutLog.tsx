import { privateMeta } from "~/shared/i18n/site";

export const meta = () => privateMeta("Workout — Metrivum");

import { useState } from "react";
import { Link, useParams } from "react-router";
import type { Schema, PlanAnnotation, ExerciseSnapshot, Prescription, Workout } from "@trainflow/api-client-web";
import { Alert, AlertDialog, Button, Checkbox, EmptyState, NumberInput, PageHeader, TextArea, TextField, toast } from "@trainflow/ui-web";
import { Check, SkipForward } from "lucide-react";
import { ExercisePicker } from "~/modules/exercises";
import { useCoachingMutation, useCoachingQuery } from "~/modules/coaching";
import { DraftNavigationGuard, Failure, Loading, MutationError } from "~/modules/coaching";
import { useUnsavedWorkGuard } from "~/shared/session/dirty-guard";
import { localDate } from "./Assignments";
import { CoachAnalysisChips } from "~/modules/video-analysis";
import type { Occurrence } from "./TrainingHome";
import styles from "./delivery.module.css";
import { WorkoutFeedbackForm, WorkoutComparisonPanel } from "./WorkoutReview";

type ActualSet = { id?: string; prescribedSetId: string | null; prescribedSegmentId: string | null; skipped: boolean; reps: number | null; load: number | null; loadUnit: string | null; loadMeaning: string; rpe: number | null; rir: number | null; durationSeconds: number | null; distanceMeters: number | null; restSeconds: number | null; tempo: string | null; comment: string | null };
type ActualExercise = { prescribedInstanceId: string | null; exerciseId: string; name?: string; comment: string; sets: ActualSet[] };
interface Execution { feedback?: Schema<"WorkoutFeedback"> | null; startedAt: string; completedAt: string | null; id: string; version: number; status: string; performedDate: string; comment: string; durationSeconds: number | null; exercises: ActualExercise[]; allowedActions: string[] }
interface Detail { occurrence: Occurrence; prescription: { annotations?: PlanAnnotation[]; workout: Workout; exercises: Record<string, ExerciseSnapshot>; formulas: Record<string, { result: { value: number; unit: string } }> }; execution: Execution | null }
const blankSet = (prescribedSetId: string | null = null, prescribedSegmentId: string | null = null): ActualSet => ({ prescribedSetId, prescribedSegmentId, skipped: false, reps: null, load: null, loadUnit: "kg", loadMeaning: "TotalExternal", rpe: null, rir: null, durationSeconds: null, distanceMeters: null, restSeconds: null, tempo: null, comment: "" });
function describe(p: Prescription) {
  return [p.reps && `${p.reps.minimum}–${p.reps.maximum} reps`, p.load && `${p.load.minimum.value}–${p.load.maximum.value} ${p.load.minimum.unit}`, p.loadPercent && `${p.loadPercent}% 1RM`, p.rpe && `RPE ${p.rpe}`, p.rir != null && `RIR ${p.rir}`, p.workTime && `${p.workTime.value} ${p.workTime.unit}`, p.distance && `${p.distance.value} ${p.distance.unit}`, p.rest && `rest ${p.rest.value} ${p.rest.unit}`, p.tempo && `tempo ${p.tempo}`, p.comment].filter(Boolean).join(" · ") || "No prescribed values";
}

function ExecutionEditor({ detail, execution, own }: { detail: Detail; execution: Execution; own: boolean }) {
  const [draft, setDraft] = useState(() => ({ performedDate: execution.performedDate || localDate(), comment: execution.comment, durationSeconds: execution.durationSeconds,
    exercises: execution.exercises.length ? execution.exercises : detail.prescription.workout.exercises.map(exercise => ({ prescribedInstanceId: exercise.id, exerciseId: exercise.exerciseId, name: detail.prescription.exercises[exercise.exerciseId]?.name, comment: "", sets: exercise.sets.flatMap(set => set.segments?.length ? set.segments.map(segment => blankSet(set.id, segment.id)) : [blankSet(set.id)]) })) }));
  const [version, setVersion] = useState(execution.version);
  const [dirty, setDirty] = useState(false);
  const [picker, setPicker] = useState<number | null>(null);
  const mutate = useCoachingMutation<Execution>();
  useUnsavedWorkGuard(() => dirty);
  const canEdit = execution.allowedActions.includes("edit") || execution.allowedActions.includes("save") || execution.allowedActions.includes("correct");
  const patchExercise = (index: number, change: Partial<ActualExercise>) => { setDirty(true); setDraft(value => ({ ...value, exercises: value.exercises.map((exercise, i) => i === index ? { ...exercise, ...change } : exercise) })); };
  const patchSet = (exercise: number, set: number, change: Partial<ActualSet>) => patchExercise(exercise, { sets: draft.exercises[exercise]!.sets.map((item, i) => i === set ? { ...item, ...change } : item) });
  async function save(complete: boolean) {
    const body = { ...draft, exercises: draft.exercises.map(({ prescribedInstanceId, exerciseId, comment, sets }) => ({ prescribedInstanceId, exerciseId, comment, sets: sets.map(set => ({ ...set, loadUnit: set.load == null ? null : set.loadUnit || "kg" })) })) };
    const saved = await mutate.mutateAsync({ method: "PUT", path: `/api/v1/training/executions/${execution.id}`, ifMatch: version, json: body });
    setVersion(saved.version); setDirty(false);
    if (complete) await mutate.mutateAsync({ method: "POST", path: `/api/v1/training/executions/${execution.id}/complete`, ifMatch: saved.version });
  }
  return <div className={styles.stack}><DraftNavigationGuard dirty={dirty} /><MutationError error={mutate.error} />
    <Alert title="Prescription and actual training stay separate">Enter only what you performed. Blank values are unknown; skipped sets are excluded from performance. Saved corrections overwrite your actual log and preserve the original prescription.</Alert>
    <div className={styles.formRow}><TextField label="Performed date" type="date" value={draft.performedDate} isDisabled={!canEdit} onChange={value => { setDirty(true); setDraft({ ...draft, performedDate: value }); }} /><NumberInput label="Session duration (seconds)" placeholder="e.g. 3600" minValue={0} value={draft.durationSeconds ?? Number.NaN} isDisabled={!canEdit} onChange={value => { setDirty(true); setDraft({ ...draft, durationSeconds: Number.isFinite(value) ? value : null }); }} /></div>
    <p className={styles.muted}>{detail.prescription.workout.description}</p>
    {detail.prescription.workout.groups.map(group => <p key={group.id}>{group.kind} · {group.rounds} rounds · {group.restSeconds}s rest · {group.exerciseIds.map(id => detail.prescription.workout.exercises.find(ex => ex.id === id)).map(ex => ex && detail.prescription.exercises[ex.exerciseId]?.name).filter(Boolean).join(" → ")}</p>)}
    {draft.exercises.map((exercise, exIndex) => {
      const prescribed = detail.prescription.workout.exercises.find(item => item.id === exercise.prescribedInstanceId);
      return <article className={styles.card} key={exIndex}><div className={styles.row}><h2>{exercise.name || detail.prescription.exercises[exercise.exerciseId]?.name || "Exercise"}</h2>{canEdit && <Button size="sm" onPress={() => setPicker(exIndex)}>Substitute exercise</Button>}</div>
        {prescribed && <p className={styles.muted}>Prescribed: {detail.prescription.exercises[prescribed.exerciseId]?.name} {prescribed.comment}</p>}
        {prescribed?.exerciseId !== exercise.exerciseId && <p>Substitution — the original prescription is unchanged.</p>}
        <div className={styles.scroll}><table className={`${styles.table} ${styles.workoutSets}`}><thead><tr><th>Set / prescription</th><th>Actual reps</th><th>Load</th><th>Unit / meaning</th><th>RPE / RIR</th><th>Time / distance</th><th>Rest / tempo</th><th>Skip / note</th></tr></thead><tbody>{exercise.sets.map((set, setIndex) => {
          const original = prescribed?.sets.find(item => item.id === set.prescribedSetId); const p = original?.segments?.find(segment => segment.id === set.prescribedSegmentId)?.prescription || original?.prescription;
          const numeric = (key: keyof ActualSet, label: string) => <label className={styles.actualField}><span>{label}</span><input aria-label={`${exercise.name || "Exercise"} set ${setIndex + 1} ${label}`} inputMode="decimal" type="number" step="any" min="0" disabled={!canEdit || set.skipped} value={set[key] == null ? "" : String(set[key])} onChange={event => patchSet(exIndex, setIndex, { [key]: event.target.value === "" ? null : Number(event.target.value) })} /></label>;
          return <tr key={setIndex}><td>{setIndex + 1} · {original?.kind || "Extra"}{set.id ? <> <CoachAnalysisChips executionId={execution.id} setId={set.id} enabled={own} /></> : null}<p className={styles.muted}>{p ? describe(p) : "Not in prescription"}</p>{(set.prescribedSegmentId || set.prescribedSetId) && detail.prescription.formulas?.[set.prescribedSegmentId || set.prescribedSetId!] && <p className={styles.muted}>Calculated prescription: {detail.prescription.formulas[set.prescribedSegmentId || set.prescribedSetId!]!.result.value} {detail.prescription.formulas[set.prescribedSegmentId || set.prescribedSetId!]!.result.unit}</p>}</td><td>{numeric("reps", "reps")}</td><td>{numeric("load", "load")}</td><td data-label="Load unit / meaning"><select aria-label={`Set ${setIndex + 1} load unit`} value={set.loadUnit || "kg"} disabled={!canEdit} onChange={event => patchSet(exIndex, setIndex, { loadUnit: event.target.value })}><option>kg</option><option>lb</option></select><select aria-label={`Set ${setIndex + 1} load meaning`} disabled={!canEdit} value={set.loadMeaning} onChange={event => patchSet(exIndex, setIndex, { loadMeaning: event.target.value })}>{["TotalExternal", "PerHand", "Bodyweight", "Assisted"].map(value => <option key={value}>{value}</option>)}</select></td><td>{numeric("rpe", "RPE")}{numeric("rir", "RIR")}</td><td>{numeric("durationSeconds", "seconds")}{numeric("distanceMeters", "meters")}</td><td>{numeric("restSeconds", "rest seconds")}<input placeholder="Tempo" aria-label={`Set ${setIndex + 1} tempo`} disabled={!canEdit} value={set.tempo || ""} onChange={event => patchSet(exIndex, setIndex, { tempo: event.target.value })} /></td><td data-label="Skip / note"><Checkbox isDisabled={!canEdit} isSelected={set.skipped} onChange={skipped => patchSet(exIndex, setIndex, { skipped })}>Skipped</Checkbox><input placeholder="Set note" aria-label={`Set ${setIndex + 1} comment`} disabled={!canEdit} value={set.comment || ""} onChange={event => patchSet(exIndex, setIndex, { comment: event.target.value })} />{canEdit && !set.prescribedSetId && <Button size="sm" variant="ghost" onPress={() => patchExercise(exIndex, { sets: exercise.sets.filter((_, i) => i !== setIndex) })}>Remove extra set</Button>}</td></tr>;
        })}</tbody></table></div>
        {canEdit && <Button size="sm" onPress={() => patchExercise(exIndex, { sets: [...exercise.sets, blankSet()] })}>Add actual set</Button>}
        <TextArea label="Exercise comment" placeholder="How did this exercise feel?" value={exercise.comment} isDisabled={!canEdit} onChange={comment => patchExercise(exIndex, { comment })} />
      </article>;
    })}
    <ExercisePicker isOpen={picker !== null} onOpenChange={open => { if (!open) setPicker(null); }} onPick={exercise => { if (picker !== null) patchExercise(picker, { exerciseId: exercise.id, name: exercise.name, sets: draft.exercises[picker]!.sets.map(set => ({ ...set, load: null })) }); }} />
    <TextArea label="Session comment" placeholder="Energy, sleep, anything worth noting" value={draft.comment} isDisabled={!canEdit} onChange={comment => { setDirty(true); setDraft({ ...draft, comment }); }} />
    {canEdit && <div className={`${styles.toolbar} ${styles.workoutActions}`}><span className={styles.saveStatus} role="status">{mutate.isPending ? "Saving…" : mutate.isError ? "Save failed — try again" : dirty ? "Unsaved changes" : "All changes saved"}</span><Button loading={mutate.isPending} onPress={() => { void save(false).catch(() => {}); }}>Save {execution.status === "Completed" ? "correction" : "draft"}</Button>{execution.status !== "Completed" && <Button variant="primary" loading={mutate.isPending} onPress={() => { void save(true).catch(() => {}); }}>Save and complete workout</Button>}</div>}
  </div>;
}

export function WorkoutDetail({ occurrenceId, relationshipId }: { occurrenceId: string; relationshipId?: string }) {
  const query = useCoachingQuery<Detail>(`/api/v1/training/workouts/${occurrenceId}`, { relationshipId });
  const mutate = useCoachingMutation();
  const [reason, setReason] = useState("");
  const [skipping, setSkipping] = useState(false);
  // "Mark as done" starts and completes the workout in one go; the sets can still be corrected afterwards.
  const markDone = async () => {
    const started = await mutate.mutateAsync({ method: "POST", path: `/api/v1/training/workouts/${occurrenceId}/start` }) as { id: string; version: number };
    await mutate.mutateAsync({ method: "POST", path: `/api/v1/training/executions/${started.id}/complete`, ifMatch: started.version });
    toast({ tone: "success", title: "Workout marked as done", description: "You can still add the details of your sets below." });
  };
  if (query.isPending) return <Loading />;
  if (query.isError) return <Failure error={query.error} retry={() => void query.refetch()} />;
  const detail = query.data;
  return <><PageHeader title={detail.occurrence.name} description={`${detail.occurrence.programName} · Scheduled ${detail.occurrence.scheduledDate} · ${detail.occurrence.status}`} /><MutationError error={mutate.error} /><p className={styles.muted}>Prescription snapshot: {detail.occurrence.revisionId} · <Link to={`/app/programs/${detail.occurrence.programId}`}>View program</Link></p>{detail.execution && <p className={styles.muted}>Performed {detail.execution.performedDate} · Started {new Date(detail.execution.startedAt).toLocaleString()} · Finished {detail.execution.completedAt ? new Date(detail.execution.completedAt).toLocaleString() : "Not completed"} · Duration {detail.execution.durationSeconds == null ? "Not recorded" : `${detail.execution.durationSeconds}s`}</p>}
    {detail.prescription.annotations?.map(note => <section className={styles.card} key={note.id}><small>{note.kind}</small><h2>{note.title}</h2><p style={{ whiteSpace: "pre-wrap" }}>{note.content}</p></section>)}
    {detail.execution && detail.execution.status !== "Skipped" ? <><CoachAnalysisChips executionId={detail.execution.id} enabled={!relationshipId} /><ExecutionEditor key={`${detail.execution.id}:${detail.execution.status}`} detail={detail} execution={detail.execution} own={!relationshipId} /><WorkoutFeedbackForm key={`feedback:${detail.execution.id}:${detail.execution.version}`} execution={detail.execution} own={!relationshipId} /><WorkoutComparisonPanel executionId={detail.execution.id} /></> : <div className={styles.stack}>
      {detail.execution?.comment && <p>Session comment: {detail.execution.comment}</p>}
      {detail.prescription.workout.exercises.map(exercise => <section key={exercise.id} className={styles.card}><h2>{detail.prescription.exercises[exercise.exerciseId]?.name}</h2>{exercise.sets.map((set, i) => <p key={set.id}>{i + 1}. {set.kind}: {describe(set.prescription)}</p>)}</section>)}
      {detail.occurrence.allowedActions.includes("start") || detail.occurrence.allowedActions.includes("skip") ? (
        <div className={styles.workoutDecision}>
          {detail.occurrence.allowedActions.includes("start") ? <Button size="sm" variant="success" iconStart={<Check />} loading={mutate.isPending && !skipping} onPress={() => { void markDone().catch(() => {}); }}>Mark as done</Button> : null}
          {detail.occurrence.allowedActions.includes("skip") ? <Button size="sm" variant="ghost" iconStart={<SkipForward />} isDisabled={mutate.isPending} onPress={() => { setReason(""); setSkipping(true); }}>Mark skipped</Button> : null}
        </div>
      ) : <EmptyState title="Read-only workout" description="The assignment or coaching relationship does not currently allow logging this workout." />}
      {/* Why it was skipped is asked in a dialog, only when the workout is skipped. */}
      <AlertDialog isOpen={skipping} onOpenChange={(open) => { if (!open && !mutate.isPending) setSkipping(false); }} title="Mark this workout as skipped?" confirmLabel="Mark skipped" cancelLabel="Keep it" isConfirming={mutate.isPending}
        onConfirm={() => mutate.mutate({ method: "POST", path: `/api/v1/training/workouts/${occurrenceId}/skip`, json: { reason: reason || null } }, { onSuccess: () => { setSkipping(false); toast({ title: "Workout marked as skipped" }); } })}>
        <TextArea label="Reason for skipping (optional)" placeholder="e.g. Felt sick, travelling" value={reason} onChange={setReason} maxLength={2000} />
      </AlertDialog>
    </div>}
  </>;
}

export default function WorkoutLog() { const { occurrenceId } = useParams(); return <WorkoutDetail occurrenceId={occurrenceId!} />; }
