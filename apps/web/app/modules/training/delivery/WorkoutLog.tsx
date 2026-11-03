import { formatInterfaceText } from "~/shared/i18n/interface-format";
import { useT as useUiCopy } from "~/shared/i18n/AppLocale";
import { privateMeta } from "~/shared/i18n/site";

export const meta = () => privateMeta("Workout — Metrivum");

import { useContext, useMemo, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router";
import type { Schema, PlanAnnotation, ExerciseSnapshot, Prescription, Workout } from "@metrivum/api-client-web";
import { AlertDialog, Avatar, Button, Checkbox, Dialog, EmptyState, IconButton, LinkButton, Segment, SegmentedControl, Tab, TabList, Tabs, NumberInput, PageBackContext, TextArea, TextField, toast } from "@metrivum/ui-web";
import { ArrowLeft, ArrowRight, Check, CircleSlash, Eraser, Lock, MessageSquare, MessageSquareQuote, PencilLine, Plus, Repeat, Timer, Trash2, Undo2, X } from "lucide-react";
import { StatusBadge } from "~/modules/coaching";
import { isUnavailableResource } from "~/shared/lib/ResourceError";

/** "Monday, 27 October" for a plain date. */
const longDay = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
import { ExercisePicker, useDictionaryLabel, useExerciseNames } from "~/modules/exercises";
import { MuscleHeatmap } from "~/modules/anatomy";
import { useCoachingMutation, useCoachingQuery } from "~/modules/coaching";
import { DraftNavigationGuard, Failure, Loading, MutationError } from "~/modules/coaching";
import { useUnsavedWorkGuard } from "~/shared/session/dirty-guard";
import { useWorkspace } from "~/shared/session/WorkspaceScope";
import { localDate } from "./Assignments";
import { CoachAnalysisChips } from "~/modules/video-analysis";
import { completedLabel, type Occurrence } from "./TrainingHome";
import styles from "./delivery.module.css";
import { FeedbackFields, WorkoutFeedbackForm } from "./WorkoutReview";

type ActualSet = { id?: string; prescribedSetId: string | null; prescribedSegmentId: string | null; skipped: boolean; reps: number | null; load: number | null; loadUnit: string | null; loadMeaning: string; rpe: number | null; rir: number | null; durationSeconds: number | null; distanceMeters: number | null; restSeconds: number | null; tempo: string | null; comment: string | null };
type ActualExercise = { prescribedInstanceId: string | null; exerciseId: string; name?: string; comment: string; sets: ActualSet[] };
interface Execution { feedback?: Schema<"WorkoutFeedback"> | null; startedAt: string; completedAt: string | null; id: string; version: number; status: string; performedDate: string; comment: string; durationSeconds: number | null; exercises: ActualExercise[]; allowedActions: string[] }
interface Detail { occurrence: Occurrence; prescription: { annotations?: PlanAnnotation[]; workout: Workout; exercises: Record<string, ExerciseSnapshot>; formulas: Record<string, { result: { value: number; unit: string } }> }; execution: Execution | null }
const blankSet = (prescribedSetId: string | null = null, prescribedSegmentId: string | null = null): ActualSet => ({ prescribedSetId, prescribedSegmentId, skipped: false, reps: null, load: null, loadUnit: "kg", loadMeaning: "TotalExternal", rpe: null, rir: null, durationSeconds: null, distanceMeters: null, restSeconds: null, tempo: null, comment: "" });

/** Typing a number: empty stays empty (unknown), anything else becomes a number. */
const num = (value: string) => (value.trim() === "" ? null : Number(value.replace(",", ".")));

/** The plan's exercises as an empty log: every set present, every value blank. */
const emptyLog = (detail: Detail): ActualExercise[] => detail.prescription.workout.exercises.map(exercise => ({ prescribedInstanceId: exercise.id, exerciseId: exercise.exerciseId, name: detail.prescription.exercises[exercise.exerciseId]?.name, comment: "", sets: exercise.sets.flatMap(set => set.segments?.length ? set.segments.map(segment => blankSet(set.id, segment.id)) : [blankSet(set.id)]) }));

/** The plan's exercises logged exactly as planned: the lower end of each range, the planned load and effort. */
const asPlanned = (detail: Detail): ActualExercise[] => detail.prescription.workout.exercises.map(exercise => ({ prescribedInstanceId: exercise.id, exerciseId: exercise.exerciseId, name: detail.prescription.exercises[exercise.exerciseId]?.name, comment: "",
  sets: exercise.sets.flatMap(set => (set.segments?.length ? set.segments.map(segment => ({ id: segment.id, prescription: segment.prescription, setId: set.id, segmentId: segment.id as string | null })) : [{ id: set.id, prescription: set.prescription, setId: set.id, segmentId: null }]).map(item => {
    const p = item.prescription;
    const unit = p.load ? String(p.load.minimum.unit).toLowerCase() : "";
    const kg = p.load && (unit === "kg" || unit === "lb") ? p.load.minimum : null;
    return { ...blankSet(item.setId, item.segmentId), reps: p.reps ? p.reps.minimum : null, load: kg ? kg.value : null, loadUnit: kg ? unit : "kg", rpe: p.rpe ?? null, rir: p.rir ?? null,
      durationSeconds: p.workTime ? toSeconds(p.workTime) : null, distanceMeters: p.distance ? (/^k/i.test(String(p.distance.unit)) ? p.distance.value * 1000 : p.distance.value) : null, restSeconds: p.rest ? toSeconds(p.rest) : null, tempo: p.tempo ?? null };
  })) }));

/**
 * The log in a side panel: one card per exercise with a table to type into, like the plan behind it. Every value is
 * optional; blank means "not recorded". Closing without saving drops the draft.
 */
function ExecutionEditor({ detail, execution, own, feedbackOwn, onClose }: { detail: Detail; execution: Execution; own: boolean; feedbackOwn: boolean; onClose: () => void }) {
  const uiCopy = useUiCopy();

  const [feedback, setFeedback] = useState<Partial<NonNullable<Execution["feedback"]>>>(() => execution.feedback ?? {});
  const feedbackReady = feedback.rating != null && feedback.wellbeing != null && feedback.sleepQuality != null && feedback.sessionRpe != null;
  const feedbackChanged = JSON.stringify(feedback) !== JSON.stringify(execution.feedback ?? {});
  const [draft, setDraft] = useState(() => ({ performedDate: execution.performedDate || localDate(), comment: execution.comment, durationSeconds: execution.durationSeconds,
    // Nothing logged yet: start from the plan, so saving straight away records it as planned.
    exercises: execution.exercises.some(exercise => exercise.sets.some(performed)) ? execution.exercises : asPlanned(detail) }));
  const [version, setVersion] = useState(execution.version);
  const [dirty, setDirty] = useState(false);
  // Which exercise the picker replaces, or "add" for a new one done outside the plan.
  const [picker, setPicker] = useState<number | "add" | null>(null);
  const [more, setMore] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const removeExercise = (index: number) => { setDirty(true); setDraft(value => ({ ...value, exercises: value.exercises.filter((_, i) => i !== index) })); };
  const mutate = useCoachingMutation<Execution>();
  useUnsavedWorkGuard(() => dirty);
  const canEdit = execution.allowedActions.includes("edit") || execution.allowedActions.includes("save") || execution.allowedActions.includes("correct");
  const patchExercise = (index: number, change: Partial<ActualExercise>) => { setDirty(true); setDraft(value => ({ ...value, exercises: value.exercises.map((exercise, i) => i === index ? { ...exercise, ...change } : exercise) })); };
  const patchSet = (exercise: number, set: number, change: Partial<ActualSet>) => patchExercise(exercise, { sets: draft.exercises[exercise]!.sets.map((item, i) => i === set ? { ...item, ...change } : item) });
  async function save(exercises: ActualExercise[], message: string) {
    const body = { ...draft, exercises: exercises.map(({ prescribedInstanceId, exerciseId, comment, sets }) => ({ prescribedInstanceId, exerciseId, comment, sets: sets.map(set => ({ ...set, loadUnit: set.load == null ? null : set.loadUnit || "kg" })) })) };
    const saved = await mutate.mutateAsync({ method: "PUT", path: `/api/v1/training/executions/${execution.id}`, ifMatch: version, json: body });
    setVersion(saved.version); setDirty(false);
    let current = saved.version;
    if (execution.status !== "Completed") current = (await mutate.mutateAsync({ method: "POST", path: `/api/v1/training/executions/${execution.id}/complete`, ifMatch: saved.version })).version;
    // Feedback goes with the log when it is complete (all four answers) and changed.
    if (feedbackOwn && feedbackReady && feedbackChanged) await mutate.mutateAsync({ method: "PUT", path: `/api/v1/training/executions/${execution.id}/feedback`, ifMatch: current, json: feedback });
    toast({ tone: "success", title: message });
    onClose();
  }
  // Clear: back to an empty log of the plan (nothing recorded), not saved until Save.
  const clear = () => { setDirty(true); setDraft(value => ({ ...value, durationSeconds: null, comment: "", exercises: emptyLog(detail) })); };
  const close = () => { if (dirty) setConfirmClose(true); else onClose(); };
  const field = (exIndex: number, setIndex: number, set: ActualSet, key: "reps" | "load" | "rpe" | "rir" | "durationSeconds" | "distanceMeters" | "restSeconds", label: string, placeholder = "") =>
    <input className={styles.wkInput} aria-label={formatInterfaceText(uiCopy["ui"]["Set {0} {1}"], [setIndex + 1,label])} inputMode="decimal" placeholder={placeholder} disabled={!canEdit || set.skipped}
      value={set[key] == null ? "" : String(set[key])} onChange={event => { const value = num(event.target.value); if (value === null || Number.isFinite(value)) patchSet(exIndex, setIndex, { [key]: value }); }} />;
  const footer = canEdit ? <div className={styles.wkPanelFoot}>
    <Button variant="ghost" iconStart={<Eraser />} isDisabled={mutate.isPending} onPress={clear}>{uiCopy["editor"]["sheet"]["clear"]}</Button>
    <Button variant="secondary" isDisabled={mutate.isPending} onPress={close}>{uiCopy["common"]["cancel"]}</Button>
    <Button variant="primary" loading={mutate.isPending} onPress={() => { void save(draft.exercises, "Log saved").catch(() => {}); }}>{uiCopy["common"]["save"]}</Button>
  </div> : <div className={styles.wkPanelFoot}><Button variant="secondary" onPress={onClose}>{uiCopy["common"]["close"]}</Button></div>;
  const state = mutate.isPending ? "saving" : mutate.isError ? "error" : dirty ? "dirty" : null;
  const title = <span className={styles.wkPanelTitle}>
    {execution.exercises.some(x => x.sets.some(performed)) ? uiCopy["ui"]["Edit your log"] : uiCopy["ui"]["Log your sets"]}
    {state ? <span className={styles.wkSaveState} data-state={state} role="status">{state === "saving" ? uiCopy["editor"]["status"]["saving"] : state === "error" ? uiCopy["ui"]["Save failed"] : uiCopy["editor"]["status"]["dirty"]}</span> : null}
  </span>;
  return <Dialog isOpen onOpenChange={open => { if (!open) close(); }} title={title} size="xl" placement="right" isDismissable={!dirty} footer={() => footer}>
    <div className={styles.wkForm}>
    <DraftNavigationGuard dirty={dirty} /><MutationError error={mutate.error} />
    <p className={styles.wkFormHint}>{uiCopy["ui"]["Fill in what you want to remember. Every field is optional: leave it blank if you didn't track it. It starts filled in with the plan: change only what went differently."]}</p>

    <section className={styles.wkSession}>
      <TextField label={uiCopy["ui"]["Date"]} type="date" value={draft.performedDate} isDisabled={!canEdit} onChange={value => { setDirty(true); setDraft({ ...draft, performedDate: value }); }} />
      <NumberInput label={uiCopy["ui"]["Duration (min)"]} placeholder="e.g. 60" minValue={0} value={draft.durationSeconds == null ? Number.NaN : Math.round(draft.durationSeconds / 60)} isDisabled={!canEdit}
        onChange={value => { setDirty(true); setDraft({ ...draft, durationSeconds: Number.isFinite(value) ? value * 60 : null }); }} />
      <TextField className={styles.wkSessionNote} label={uiCopy["ui"]["Session note"]} placeholder={uiCopy["ui"]["Anything worth noting about the session"]} value={draft.comment} isDisabled={!canEdit} onChange={comment => { setDirty(true); setDraft({ ...draft, comment }); }} />
    </section>

    <div className={styles.wkFormBar}>
      <Checkbox isSelected={more} onChange={setMore}>{uiCopy["ui"]["More fields (RIR, time, distance, rest, tempo, notes)"]}</Checkbox>
    </div>

    <ol className={styles.wkSteps}>{draft.exercises.map((exercise, exIndex) => {
      const prescribed = detail.prescription.workout.exercises.find(item => item.id === exercise.prescribedInstanceId);
      const name = exercise.name || detail.prescription.exercises[exercise.exerciseId]?.name || "Exercise";
      const swapped = prescribed && prescribed.exerciseId !== exercise.exerciseId;
      let working = 0;
      return <li key={exIndex} className={styles.wkStep} data-tone={exIndex % 4}>
        <span className={styles.wkNode} aria-hidden="true">{exIndex + 1}</span>
        <article className={styles.wkCard}>
          <header>
            <div>
              <h2>{name}</h2>
              {swapped ? <p>{uiCopy["ui"]["Instead of"]} {detail.prescription.exercises[prescribed.exerciseId]?.name}</p> : !prescribed ? <p>{uiCopy["ui"]["Not in the plan"]}</p> : null}
            </div>
            {canEdit ? <span className={styles.wkCardTools}>
              <Button size="sm" variant="ghost" iconStart={<Repeat />} onPress={() => setPicker(exIndex)}>{uiCopy["ui"]["Substitute"]}</Button>
              <IconButton size="sm" variant="ghost" icon={<Trash2 />} label={formatInterfaceText(uiCopy["ui"]["Remove {0} from the log"], [name])} showTooltip onPress={() => removeExercise(exIndex)} />
            </span> : null}
          </header>
          <div className={styles.wkTableWrap}>
            <table className={styles.wkTable}>
              <thead><tr>
                <th>{uiCopy["editor"]["columns"]["set"]}</th><th>{uiCopy["ui"]["Plan"]}</th><th>{uiCopy["editor"]["columns"]["reps"]}</th><th>{uiCopy["editor"]["panel"]["loadMode"]}</th><th>RPE</th>
                {more ? <><th>RIR</th><th>{uiCopy["video"]["detail"]["time"]}</th><th>{uiCopy["ui"]["Distance (m)"]}</th><th>{uiCopy["ui"]["Rest (s)"]}</th><th>{uiCopy["ui"]["Tempo"]}</th><th>{uiCopy["video"]["new"]["note"]}</th></> : null}
                <th><span className="sr-only">{uiCopy["ui"]["Skip"]}</span></th>
              </tr></thead>
              <tbody>{exercise.sets.map((set, setIndex) => {
                const original = prescribed?.sets.find(item => item.id === set.prescribedSetId);
                const p = original?.segments?.find(segment => segment.id === set.prescribedSegmentId)?.prescription || original?.prescription;
                const target = p ? targetOf(p) : null;
                const label = original?.kind === "Warmup" ? "W" : original ? String(++working) : "+";
                return <tr key={setIndex} data-skipped={set.skipped || undefined} data-extra={!original || undefined}>
                  <td><span className={styles.wkRowNo}>{label}</span>{set.id ? <CoachAnalysisChips executionId={execution.id} setId={set.id} enabled={own} /> : null}</td>
                  <td className={styles.wkPlanCell}>{target ? <>{target.main ? `${target.main.value} ${target.main.unit}` : ""}{target.load ? ` × ${target.load}` : ""}{target.extras.length ? <small>{target.extras.join(" · ")}</small> : null}</> : <small>{uiCopy["ui"]["Extra set"]}</small>}</td>
                  <td>{field(exIndex, setIndex, set, "reps", "reps", target?.main?.unit === "reps" ? target.main.value.split("–")[0] : "")}</td>
                  <td><span className={styles.wkLoad}>{field(exIndex, setIndex, set, "load", "load", p?.load ? String(p.load.minimum.value) : "")}
                    <select className={styles.wkUnit} aria-label={formatInterfaceText(uiCopy["ui"]["Set {0} load unit"], [setIndex + 1])} value={set.loadUnit || "kg"} disabled={!canEdit || set.skipped}
                      onChange={event => patchSet(exIndex, setIndex, { loadUnit: event.target.value })}><option value="kg">kg</option><option value="lb">lb</option></select></span></td>
                  <td>{field(exIndex, setIndex, set, "rpe", "RPE", p?.rpe != null ? String(p.rpe) : "")}</td>
                  {more ? <>
                    <td>{field(exIndex, setIndex, set, "rir", "RIR")}</td>
                    <td>{field(exIndex, setIndex, set, "durationSeconds", "time in seconds")}</td>
                    <td>{field(exIndex, setIndex, set, "distanceMeters", "distance in meters")}</td>
                    <td>{field(exIndex, setIndex, set, "restSeconds", "rest in seconds")}</td>
                    <td><input className={styles.wkInput} aria-label={formatInterfaceText(uiCopy["ui"]["Set {0} tempo"], [setIndex + 1])} disabled={!canEdit || set.skipped} value={set.tempo || ""} onChange={event => patchSet(exIndex, setIndex, { tempo: event.target.value })} /></td>
                    <td><input className={`${styles.wkInput} ${styles.wkInputWide}`} aria-label={formatInterfaceText(uiCopy["ui"]["Set {0} note"], [setIndex + 1])} disabled={!canEdit} value={set.comment || ""} onChange={event => patchSet(exIndex, setIndex, { comment: event.target.value })} /></td>
                  </> : null}
                  <td className={styles.wkRowTools}>
                    {canEdit && !set.prescribedSetId
                      ? <IconButton size="sm" variant="ghost" label={formatInterfaceText(uiCopy["ui"]["Remove extra set {0}"], [setIndex + 1])} icon={<Trash2 />} onPress={() => patchExercise(exIndex, { sets: exercise.sets.filter((_, i) => i !== setIndex) })} />
                      : <IconButton size="sm" variant="ghost" showTooltip label={set.skipped ? `Set ${setIndex + 1} skipped, undo` : `Skip set ${setIndex + 1}`} icon={set.skipped ? <Undo2 /> : <CircleSlash />} isDisabled={!canEdit} onPress={() => patchSet(exIndex, setIndex, { skipped: !set.skipped })} />}
                  </td>
                </tr>;
              })}</tbody>
            </table>
          </div>
          {canEdit ? <footer className={styles.wkCardFoot}>
            <Button size="sm" variant="ghost" iconStart={<Plus />} onPress={() => patchExercise(exIndex, { sets: [...exercise.sets, blankSet()] })}>{uiCopy["editor"]["addSet"]}</Button>
            <input className={`${styles.wkInput} ${styles.wkInputNote}`} aria-label={formatInterfaceText(uiCopy["ui"]["{0} note"], [name])} placeholder={uiCopy["ui"]["Note for this exercise"]} value={exercise.comment} onChange={event => patchExercise(exIndex, { comment: event.target.value })} />
          </footer> : null}
        </article>
      </li>;
    })}</ol>
    {canEdit ? <button type="button" className={styles.wkAddExercise} onClick={() => setPicker("add")}><Plus aria-hidden="true" />{uiCopy["ui"]["Add an exercise you did"]}</button> : null}
    <ExercisePicker isOpen={picker !== null} onOpenChange={open => { if (!open) setPicker(null); }} onPick={exercise => {
      if (picker === "add") { setDirty(true); setDraft(value => ({ ...value, exercises: [...value.exercises, { prescribedInstanceId: null, exerciseId: exercise.id, name: exercise.name, comment: "", sets: [blankSet(), blankSet(), blankSet()] }] })); }
      else if (picker !== null) patchExercise(picker, { exerciseId: exercise.id, name: exercise.name, sets: draft.exercises[picker]!.sets.map(set => ({ ...set, load: null })) });
    }} />

    {feedbackOwn ? <section className={styles.wkFeedbackEdit}>
      <h3>{uiCopy["ui"]["How did it go?"]}</h3>
      <FeedbackFields value={feedback} onChange={next => { setDirty(true); setFeedback(next); }} />
      {!feedbackReady ? <p className={styles.wkFormHint}>{uiCopy["ui"]["Answer all four to save your feedback; the rest of the log saves either way."]}</p> : null}
    </section> : null}

    <AlertDialog isOpen={confirmClose} onOpenChange={setConfirmClose} title={uiCopy["ui"]["Discard your changes?"]} confirmLabel={uiCopy["ui"]["Discard"]} cancelLabel={uiCopy["common"]["keepEditing"]} tone="danger"
      onConfirm={() => { setConfirmClose(false); setDirty(false); onClose(); }}>

      {uiCopy["ui"]["What you typed here and haven't saved will be lost."]}
    </AlertDialog>
    </div>
  </Dialog>;
}

/** `onBack`: a back link drawn the same way as the page's own (e.g. back to a list this detail opened from). */
export function WorkoutDetail({ occurrenceId, relationshipId, onBack }: { occurrenceId: string; relationshipId?: string; onBack?: { label: string; onPress: () => void } }) {
  const uiCopy = useUiCopy();

  const query = useCoachingQuery<Detail>(`/api/v1/training/workouts/${occurrenceId}`, { relationshipId });
  // A coach sees whose workout this is.
  const { mode } = useWorkspace();
  const clientOf = query.data?.occurrence.relationshipId;
  const owner = useCoachingQuery<{ id: string; client?: { displayName: string; username?: string | null } }>(`/api/v1/coaching/relationships/${clientOf}`, undefined, mode === "coach" && Boolean(clientOf));
  const mutate = useCoachingMutation();
  const [reason, setReason] = useState("");
  const [skipping, setSkipping] = useState(false);
  const pageBack = useContext(PageBackContext);
  const back = onBack ?? (relationshipId ? null : pageBack);
  // The log opens in a side panel over the plan.
  const [logging, setLogging] = useState(false);
  const [view, setView] = useState<"plan" | "analysis">("plan");
  // "Mark as done" starts and completes the workout in one go; the sets can still be corrected afterwards.
  const markDone = async () => {
    const started = await mutate.mutateAsync({ method: "POST", path: `/api/v1/training/workouts/${occurrenceId}/start` }) as { id: string; version: number };
    await mutate.mutateAsync({ method: "POST", path: `/api/v1/training/executions/${started.id}/complete`, ifMatch: started.version });
    toast({ tone: "success", title: uiCopy["ui"]["Workout marked as done"], description: uiCopy["ui"]["Add your sets, or skip the details to save it as planned."] });
    setLogging(true);
  };
  if (query.isPending) return <Loading />;
  // Someone else's workout (or one that no longer exists): say so, and show nothing of it.
  if (query.isError && isUnavailableResource(query.error)) return <EmptyState icon={<Lock />} title={uiCopy["ui"]["This workout isn't available"]}
    description={uiCopy["ui"]["It doesn't exist, or it belongs to a plan this account can't see. Check that you're signed in to the right account."]}
    actions={relationshipId ? undefined : <LinkButton href="/app/my-training" variant="secondary">{uiCopy["ui"]["Back to my training"]}</LinkButton>} />;
  if (query.isError) return <Failure error={query.error} retry={() => void query.refetch()} />;
  const detail = query.data;
  const o = detail.occurrence;
  const e = detail.execution;
  const logged = e && e.status !== "Skipped" ? e : null;
  const plan = detail.prescription.workout.exercises;
  const canStart = o.allowedActions.includes("start");
  const canSkip = o.allowedActions.includes("skip");
  const decision = !e && (canStart || canSkip) ? <div className={styles.wkActions}>
    {canStart ? <Button variant="primary" iconStart={<Check />} loading={mutate.isPending && !skipping} onPress={() => { void markDone().catch(() => {}); }}>{uiCopy["ui"]["Mark as done"]}</Button> : null}
    {canSkip ? <Button variant="secondary" iconStart={<CircleSlash />} isDisabled={mutate.isPending} onPress={() => { setReason(""); setSkipping(true); }}>{uiCopy["ui"]["Skip"]}</Button> : null}
  </div> : null;
  const actualFor = (instanceId: string, setId: string) => logged?.exercises.find(x => x.prescribedInstanceId === instanceId)?.sets.find(set => set.prescribedSetId === setId);
  const totalSets = plan.reduce((n, x) => n + x.sets.length, 0);
  const doneSets = logged ? logged.exercises.reduce((n, x) => n + x.sets.filter(performed).length, 0) : 0;
  const volume = logged ? logged.exercises.reduce((n, x) => n + x.sets.reduce((m, set) => m + (performed(set) && set.reps && set.load && set.loadUnit !== "lb" ? set.reps * set.load : 0), 0), 0) : 0;
  const stats: { label: string; value: ReactNode }[] = [
    { label: uiCopy["exercises"]["title"], value: plan.length },
    { label: logged ? "Sets done" : "Sets", value: logged ? <>{doneSets}<small>/{totalSets}</small></> : totalSets },
    ...(logged && totalSets ? [{ label: uiCopy["ui"]["Completion"], value: <span style={{ color: completionColor(Math.round(Math.min(1, doneSets / totalSets) * 100)) }}>{Math.round(Math.min(1, doneSets / totalSets) * 100)}<small>%</small></span> }] : []),
    ...(volume ? [{ label: uiCopy["editor"]["sheet"]["volume"]["title"], value: <>{Math.round(volume).toLocaleString()}<small> kg</small></> }] : []),
    ...(logged?.durationSeconds ? [{ label: uiCopy["editor"]["sheet"]["columns"]["time"], value: <>{Math.max(1, Math.round(logged.durationSeconds / 60))}<small> min</small></> }]
      : !logged ? [{ label: uiCopy["ui"]["Estimated time"], value: <>≈ {estimateMinutes(plan)}<small> min</small></> }] : []),
    ...(logged?.feedback?.sessionRpe != null ? [{ label: uiCopy["ui"]["Session RPE"], value: String(logged.feedback.sessionRpe) }] : []),
  ];
  // Feedback is the athlete's: only they fill it in, in their own workspace. The coach reads it.
  const feedbackOwn = !relationshipId && mode === "client";
  const canLog = Boolean(logged) && ["edit", "save", "correct"].some(action => logged!.allowedActions.includes(action));
  const logActions = logged ? <div className={styles.wkActions}>
    <Button variant={doneSets ? "secondary" : "primary"} iconStart={<PencilLine />} onPress={() => setLogging(true)}>{!canLog ? uiCopy["ui"]["View log"] : doneSets ? uiCopy["ui"]["Edit log"] : uiCopy["ui"]["Log sets"]}</Button>
  </div> : null;
  return <div className={styles.wk}>
    {back ? <button type="button" className={styles.wkBack} onClick={back.onPress}><ArrowLeft aria-hidden="true" />{back.label}</button> : null}
    <MutationError error={mutate.error} />
    {/* Title block: program and date above, the name with its status, the actions on the right. */}
    <header className={styles.wkHead}>
      <div className={styles.wkHeadText}>
        {mode === "coach" && !relationshipId && owner.data?.client ? (
          <Link to={`/app/clients/${owner.data.id}`} className={styles.wkClient}>
            <Avatar name={owner.data.client!.displayName || owner.data.client!.username || "Client"} size="sm" decorative />
            <span>{uiCopy["ui"]["Workout of"]} <strong>{owner.data.client!.displayName || owner.data.client!.username}</strong></span>
            {owner.data.client!.username ? <small>@{owner.data.client!.username}</small> : null}
            <ArrowRight aria-hidden="true" />
          </Link>
        ) : null}
        <p className={styles.wkKicker}>
          <Link to={`/app/programs/${o.programId}`}>{o.programName}</Link>
          <span aria-hidden="true">·</span>
          <span>{longDay(o.scheduledDate)}</span>
          {logged?.completedAt ? <><span aria-hidden="true">·</span><span>{uiCopy["ui"]["completed"]} {completedLabel(logged.completedAt)}</span></> : logged?.performedDate && logged.performedDate !== o.scheduledDate ? <><span aria-hidden="true">·</span><span>{uiCopy["ui"]["done"]} {longDay(logged.performedDate)}</span></> : null}
          {o.loggedLate ? <><span aria-hidden="true">·</span><span className={styles.wkLate}>{uiCopy["ui"]["logged late"]}</span></> : null}
        </p>
        <div className={styles.wkTitle}>
          <h1>{o.name}</h1>
          <StatusBadge status={o.status === "InProgress" ? "In progress" : o.status} />
        </div>
      </div>
      {decision || logActions ? <div className={styles.wkHeadSide}>
        {decision}
        {logActions}
      </div> : null}
    </header>

    <dl className={styles.wkSummary}>{stats.map(stat => <div key={stat.label}><dt>{stat.label}</dt><dd>{stat.value}</dd></div>)}</dl>

    {detail.prescription.annotations?.map(note => <aside className={styles.wkNote} key={note.id}>
      <MessageSquareQuote aria-hidden="true" />
      <div><strong>{note.title || note.kind}</strong><p>{note.content}</p></div>
    </aside>)}
    {e?.status === "Skipped" ? <aside className={styles.wkNote} data-tone="muted">
      <CircleSlash aria-hidden="true" />
      <div><strong>{uiCopy["ui"]["Skipped"]}</strong><p>{e.comment ? e.comment : uiCopy["ui"]["No reason was given."]}</p></div>
    </aside> : null}
    {logged?.comment ? <aside className={styles.wkNote} data-tone="client">
      <MessageSquare aria-hidden="true" />
      <div><strong>{uiCopy["ui"]["Session comment"]}</strong><p>{logged.comment}</p></div>
    </aside> : null}
    {detail.prescription.workout.description ? <p className={styles.wkIntro}>{detail.prescription.workout.description}</p> : null}

    {logged ? <div className={styles.wkTabBar}>
      <Tabs selectedKey={view} onSelectionChange={key => setView(key === "analysis" ? "analysis" : "plan")}>
        <TabList aria-label={uiCopy["editor"]["sheet"]["addWorkout"]}>
          <Tab id="plan">{uiCopy["ui"]["Plan"]}</Tab>
          <Tab id="analysis">{uiCopy["ui"]["Analysis"]}</Tab>
        </TabList>
      </Tabs>
    </div> : null}

    {logged && view === "analysis" ? <WorkoutAnalysis detail={detail} execution={logged} feedbackOwn={feedbackOwn} /> : <>
    {/* The exercises in order along a thin rail; each is a card with its sets as rows. Once logged, the card shows
        what was really done: a substitute's name, an exercise left out, extra ones added at the end. */}
    <ol className={styles.wkSteps}>{plan.map((exercise, index) => {
      const actual = logged?.exercises.find(x => x.prescribedInstanceId === exercise.id);
      const planned = detail.prescription.exercises[exercise.exerciseId]?.name ?? "Exercise";
      const swapped = actual && actual.exerciseId !== exercise.exerciseId;
      const name = swapped ? actual.name || "Substitute" : planned;
      const firstWork = exercise.sets.find(set => set.kind !== "Warmup") ?? exercise.sets[0];
      const rest = firstWork?.prescription.rest;
      const finished = logged ? exercise.sets.filter(set => { const a = actualFor(exercise.id, set.id); return a && performed(a); }).length : 0;
      const complete = Boolean(logged) && finished === exercise.sets.length;
      const skippedAll = Boolean(logged) && finished === 0 && (!actual || actual.sets.every(set => set.skipped || !performed(set)));
      const cue = visibleCue(exercise.comment);
      let working = 0;
      return <li key={exercise.id} className={styles.wkStep} data-tone={index % 4} data-complete={complete ? "" : undefined} data-skipped={skippedAll ? "" : undefined}>
        <span className={styles.wkNode} aria-hidden="true">{complete ? <Check /> : skippedAll ? <CircleSlash /> : index + 1}</span>
        <article className={styles.wkCard}>
          <header>
            <div>
              <h2>{name}{skippedAll ? <span className={styles.wkFlag} data-tone="skipped">{actual ? uiCopy["ui"]["Skipped"] : uiCopy["ui"]["Not done"]}</span> : swapped ? <span className={styles.wkFlag} data-tone="swap">{uiCopy["ui"]["Substituted"]}</span> : logged && !complete ? <span className={styles.wkFlag} data-tone="partial">{uiCopy["ui"]["Partial"]}</span> : null}</h2>
              {swapped ? <p>{uiCopy["ui"]["Instead of"]} {planned}</p> : cue ? <p>{cue}</p> : null}
            </div>
            <span className={styles.wkCount}>
              <span>{logged ? <><b>{finished}</b>/{exercise.sets.length}  {uiCopy["ui"]["sets"]}</> : <><b>{exercise.sets.length}</b> {exercise.sets.length === 1 ? uiCopy["ui"]["set"] : uiCopy["ui"]["sets"]}</>}</span>
              {rest ? <><span aria-hidden="true">·</span><Timer aria-hidden="true" />{duration(rest)}</> : null}
            </span>
          </header>
          <ol className={styles.wkRows}>{exercise.sets.map(set => {
            const label = set.kind === "Warmup" ? "W" : String(++working);
            const done = logged ? actualFor(exercise.id, set.id) : undefined;
            return <SetRow key={set.id} label={label} kind={set.kind} prescription={set.prescription} actual={done} missing={Boolean(logged) && !done} />;
          })}</ol>
        </article>
      </li>;
    })}
    {/* Exercises done that were not in the plan. */}
    {(logged?.exercises.filter(x => !x.prescribedInstanceId) ?? []).map((extra, k) => {
      const done = extra.sets.filter(performed).length;
      return <li key={`extra-${k}`} className={styles.wkStep} data-tone={(plan.length + k) % 4} data-complete={done ? "" : undefined} data-added="">
        <span className={styles.wkNode} aria-hidden="true"><Plus /></span>
        <article className={styles.wkCard}>
          <header>
            <div><h2>{extra.name || uiCopy["editor"]["panel"]["exercise"]}<span className={styles.wkFlag} data-tone="added">{uiCopy["ui"]["Added"]}</span></h2><p>{uiCopy["ui"]["Not in the plan"]}</p></div>
            <span className={styles.wkCount}><span><b>{done}</b> {done === 1 ? uiCopy["ui"]["set"] : uiCopy["ui"]["sets"]}</span></span>
          </header>
          <ol className={styles.wkRows}>{extra.sets.map((set, i) => <SetRow key={i} label={String(i + 1)} kind="Standard" actual={set} />)}</ol>
        </article>
      </li>;
    })}</ol>
    </>}

    {!decision && !e ? <p className={styles.wkIntro}>{uiCopy["ui"]["This workout can't be logged right now: the plan or the coaching relationship doesn't allow it."]}</p> : null}

    {logged ? <CoachAnalysisChips executionId={logged.id} enabled={!relationshipId} /> : null}
    {logged && logging ? <ExecutionEditor key={`${logged.id}:${logged.version}`} detail={detail} execution={logged} own={!relationshipId} feedbackOwn={feedbackOwn} onClose={() => setLogging(false)} /> : null}

    {/* Why it was skipped is asked in a dialog, only when the workout is skipped. */}
    <AlertDialog isOpen={skipping} onOpenChange={(open) => { if (!open && !mutate.isPending) setSkipping(false); }} title={uiCopy["ui"]["Mark this workout as skipped?"]} confirmLabel={uiCopy["ui"]["Mark skipped"]} cancelLabel={uiCopy["ui"]["Keep it"]} isConfirming={mutate.isPending}
      onConfirm={() => mutate.mutate({ method: "POST", path: `/api/v1/training/workouts/${occurrenceId}/skip`, json: { reason: reason || null } }, { onSuccess: () => { setSkipping(false); toast({ title: uiCopy["ui"]["Workout marked as skipped"] }); } })}>
      <TextArea label={uiCopy["ui"]["Reason for skipping (optional)"]} placeholder={uiCopy["ui"]["e.g. Felt sick, travelling"]} value={reason} onChange={setReason} maxLength={2000} />
    </AlertDialog>
  </div>;
}

/** An exercise cue for the athlete. Notes the program generator once wrote for coaches are not shown. */
function visibleCue(comment: string | undefined) {
  const text = comment?.trim() ?? "";
  return text.startsWith("Generator role:") ? "" : text;
}

/** A set that was actually done (not skipped, with something recorded). */
function performed(set: ActualSet) {
  return !set.skipped && (set.reps != null || set.durationSeconds != null || set.distanceMeters != null || set.load != null);
}

/** A rough length of the session: each set's work (or about 40 s) plus its rest, rounded to 5 minutes. */
function estimateMinutes(plan: Workout["exercises"]) {
  const seconds = plan.reduce((total, exercise) => total + exercise.sets.reduce((sum, set) => {
    const p = set.prescription;
    const work = p.workTime ? toSeconds(p.workTime) : 40;
    return sum + work + (p.rest ? toSeconds(p.rest) : 60);
  }, 0), 0);
  return Math.max(5, Math.round(seconds / 300) * 5);
}

/** Seconds from a prescribed duration, whichever spelling the unit uses ("Minutes", "min", "h", "Seconds", "s"). */
const toSeconds = (value: { value: number; unit: string }) => (/^min/i.test(value.unit) ? value.value * 60 : /^h/i.test(value.unit) ? value.value * 3600 : value.value);

/** "90 s", "3 min" or "1 min 30 s" for a prescribed duration. */
function duration(value: { value: number; unit: string }) {
  const seconds = toSeconds(value);
  if (seconds < 60) return `${seconds} s`;
  const m = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  return rest ? `${m} min ${rest} s` : `${m} min`;
}

const range = (min: number, max: number) => (min === max ? String(min) : `${min}–${max}`);

/** The headline number of a set (reps, time or distance) and its load. */
/** Short unit labels: the API says "Kg", "Seconds", "Kilometers". */
const UNIT: Record<string, string> = { kg: "kg", lb: "lb", seconds: "s", minutes: "min", meters: "m", kilometers: "km", percent: "%", scalar: "" };
const unitLabel = (unit: string) => UNIT[unit.toLowerCase()] ?? unit;

function targetOf(p: Prescription) {
  const main = p.reps ? { value: range(p.reps.minimum, p.reps.maximum), unit: "reps" }
    : p.workTime ? { value: String(p.workTime.value), unit: unitLabel(p.workTime.unit) }
    : p.distance ? { value: String(p.distance.value), unit: unitLabel(p.distance.unit) }
    : null;
  const load = p.load ? `${range(p.load.minimum.value, p.load.maximum.value)} ${unitLabel(p.load.minimum.unit)}` : p.loadPercent ? `${p.loadPercent}% 1RM` : null;
  const extras = [p.rpe != null && `RPE ${p.rpe}`, p.rir != null && `RIR ${p.rir}`, p.tempo && `Tempo ${p.tempo}`].filter(Boolean) as string[];
  return { main, load, extras };
}

/** One set as a row: its number, the target (or what was done), the effort, and a tick once done. */
function SetRow({ label, kind, prescription, actual, missing = false }: { label: string; kind: string; prescription?: Prescription; actual?: ActualSet; missing?: boolean }) {
  const uiCopy = useUiCopy();

  const target = prescription ? targetOf(prescription) : { main: null, load: null, extras: [] as string[] };
  const done = actual ? performed(actual) : false;
  // A planned set with nothing logged (the exercise left out, or the set left blank) counts as skipped once logged.
  const state = actual ? (actual.skipped ? "skipped" : done ? "done" : missing ? "skipped" : "open") : missing ? "skipped" : undefined;
  const actualMain = actual?.reps != null ? { value: String(actual.reps), unit: "reps" } : actual?.durationSeconds != null ? { value: String(actual.durationSeconds), unit: "s" } : actual?.distanceMeters != null ? { value: String(actual.distanceMeters), unit: "m" } : null;
  const main = done && actualMain ? actualMain : target.main;
  const load = done && actual?.load != null ? `${actual.load} ${actual.loadUnit ?? "kg"}` : target.load;
  const effort = done ? [actual?.rpe != null && `RPE ${actual.rpe}`, actual?.rir != null && `RIR ${actual.rir}`].filter(Boolean) as string[] : target.extras;
  const plan = target.main ? `${target.main.value} ${target.main.unit}${target.load ? ` × ${target.load}` : ""}` : target.load ?? "";
  return <li className={styles.wkRow} data-kind={kind} data-state={state}>
    <span className={styles.wkRowNo}>{label}</span>
    <span className={styles.wkRowMain}>
      {main ? <><b>{main.value}</b> {main.unit}</> : <b>—</b>}
      {load ? <><span className={styles.wkTimes} aria-hidden="true">×</span><b>{load}</b></> : null}
      {kind !== "Standard" ? <small className={styles.wkKind}>{kind === "Warmup" ? uiCopy["editor"]["setKinds"]["Warmup"] : kind}</small> : null}
    </span>
    <span className={styles.wkRowMeta}>{state === "skipped" ? <span className={styles.wkFlag} data-tone="skipped">{uiCopy["ui"]["Skipped"]}</span> : done ? <>{plan ? `plan ${plan}` : ""}{effort.length ? `${plan ? " · " : ""}${effort.join(" · ")}` : ""}</> : effort.join(" · ")}</span>
    <span className={styles.wkRowCheck} aria-label={done ? uiCopy["dashboard"]["discovery"]["done"] : state === "skipped" ? uiCopy["ui"]["Skipped"] : undefined}>{done ? <Check aria-hidden="true" /> : state === "skipped" ? <X aria-hidden="true" /> : null}</span>
  </li>;
}

/** kg from a logged load (lb converted). */
const kgOf = (set: ActualSet) => set.load == null ? 0 : (set.loadUnit ?? "kg").toLowerCase() === "lb" ? set.load * 0.4536 : set.load;
const avg = (values: number[]) => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
const fmt = (value: number | null, digits = 0) => value == null || !Number.isFinite(value) ? "—" : new Intl.NumberFormat(undefined, { maximumFractionDigits: digits }).format(value);

/** "110 kg", or a dash when nothing was lifted (bodyweight, time, not done). */
const kgLabel = (value: number, digits = 0) => (value > 0 ? `${fmt(value, digits)} kg` : "—");

/** A colour that moves from red (0%) to green (100%). */
export const completionColor = (percent: number) => `color-mix(in oklab, var(--tf-color-success) ${Math.max(0, Math.min(100, percent))}%, var(--tf-color-danger))`;

/** Everything measurable about one logged workout: totals, per exercise, and set by set against the plan. */
function WorkoutAnalysis({ detail, execution, feedbackOwn }: { detail: Detail; execution: Execution; feedbackOwn: boolean }) {
  const uiCopy = useUiCopy();

  const plan = detail.prescription.workout.exercises;
  const plannedSets = plan.reduce((n, x) => n + x.sets.length, 0);
  const sets = execution.exercises.flatMap(x => x.sets);
  const done = sets.filter(performed);
  const skipped = sets.filter(set => set.skipped).length;
  const reps = done.reduce((n, set) => n + (set.reps ?? 0), 0);
  const plannedReps = plan.reduce((n, x) => n + x.sets.reduce((m, set) => m + (set.prescription.reps?.minimum ?? 0), 0), 0);
  const volume = done.reduce((n, set) => n + (set.reps ?? 0) * kgOf(set), 0);
  const plannedVolume = plan.reduce((n, x) => n + x.sets.reduce((m, set) => { const p = set.prescription; const kg = p.load && /kg/i.test(String(p.load.minimum.unit)) ? p.load.minimum.value : 0; return m + (p.reps?.minimum ?? 0) * kg; }, 0), 0);
  const minutes = execution.durationSeconds ? execution.durationSeconds / 60 : null;
  const rpe = avg(done.map(set => set.rpe).filter((v): v is number => v != null));
  const completion = plannedSets ? Math.round(Math.min(1, done.length / plannedSets) * 100) : 0;
  const tiles = [
    { label: uiCopy["ui"]["Completion"], value: `${completion}%`, sub: `${done.length} of ${plannedSets} sets`, color: completionColor(completion), bar: completion },
    { label: uiCopy["editor"]["sheet"]["volume"]["title"], value: `${fmt(volume)} kg`, sub: plannedVolume ? `plan ${fmt(plannedVolume)} kg · ${volume >= plannedVolume ? "+" : ""}${fmt(volume - plannedVolume)}` : "load × reps" },
    { label: uiCopy["editor"]["columns"]["reps"], value: fmt(reps), sub: plannedReps ? `plan ${fmt(plannedReps)}` : "" },
    { label: uiCopy["editor"]["sheet"]["columns"]["time"], value: minutes ? `${fmt(minutes)} min` : "—", sub: minutes && done.length ? `${fmt((minutes * 60) / done.length)} s per set` : "" },
    { label: uiCopy["ui"]["Density"], value: minutes ? `${fmt(volume / minutes)} kg/min` : "—", sub: "volume per minute" },
    { label: uiCopy["ui"]["Average RPE"], value: fmt(rpe, 1), sub: execution.feedback?.sessionRpe != null ? `session ${execution.feedback.sessionRpe}` : "from logged sets" },
    { label: uiCopy["ui"]["Skipped sets"], value: fmt(skipped), sub: `${execution.exercises.filter(x => !x.prescribedInstanceId).length} added exercises` },
  ];
  const rows = [
    ...plan.map(exercise => {
      const actual = execution.exercises.find(x => x.prescribedInstanceId === exercise.id);
      const logged = actual?.sets ?? [];
      const ok = logged.filter(performed);
      const swapped = actual && actual.exerciseId !== exercise.exerciseId;
      return { key: exercise.id, name: swapped ? actual.name || "Substitute" : detail.prescription.exercises[exercise.exerciseId]?.name ?? "Exercise", note: swapped ? "substituted" : !actual ? "not done" : "", planned: exercise.sets.length, ok };
    }),
    ...execution.exercises.filter(x => !x.prescribedInstanceId).map((x, i) => ({ key: `extra-${i}`, name: x.name || "Exercise", note: "added", planned: 0, ok: x.sets.filter(performed) })),
  ];
  return <div className={styles.an}>
    <dl className={styles.anTiles}>{tiles.map(tile => <div key={tile.label}>
      <dt>{tile.label}</dt>
      <dd style={tile.color ? { color: tile.color } : undefined}>{tile.value}</dd>
      {tile.bar != null ? <span className={styles.anBar}><span style={{ transform: `scaleX(${tile.bar / 100})`, background: tile.color }} /></span> : null}
      {tile.sub ? <small>{tile.sub}</small> : null}
    </div>)}</dl>

    <section className={styles.anSection}>
      <h2>{uiCopy["ui"]["By exercise"]}</h2>
      <div className={styles.anCard}>
        <table className={styles.anTable}>
          <thead><tr><th>{uiCopy["editor"]["panel"]["exercise"]}</th><th>{uiCopy["ui"]["Completion"]}</th><th data-num>{uiCopy["editor"]["grid"]}</th><th data-num>{uiCopy["editor"]["columns"]["reps"]}</th><th data-num>{uiCopy["ui"]["Top load"]}</th><th data-num>{uiCopy["editor"]["sheet"]["volume"]["title"]}</th><th data-num>{uiCopy["ui"]["Avg RPE"]}</th></tr></thead>
          <tbody>{rows.map((row, index) => {
            const percent = row.planned ? Math.round(Math.min(1, row.ok.length / row.planned) * 100) : 100;
            const notDone = row.note === "not done" || (row.planned > 0 && row.ok.length === 0);
            const flag = notDone ? "skipped" : row.note === "substituted" ? "swap" : row.note === "added" ? "added" : percent < 100 ? "partial" : null;
            return <tr key={row.key} data-skipped={notDone || undefined} data-added={flag === "added" || undefined}>
              <td>
                <span className={styles.anName} data-tone={index % 4}>
                  <i aria-hidden="true" />
                  <b>{row.name}</b>
                  {flag ? <span className={styles.wkFlag} data-tone={flag}>{notDone ? uiCopy["ui"]["Not done"] : flag === "swap" ? uiCopy["ui"]["Substituted"] : flag === "added" ? uiCopy["ui"]["Added"] : uiCopy["ui"]["Partial"]}</span> : null}
                </span>
              </td>
              <td><span className={styles.anCompletion}><span className={styles.anBar}><span style={{ transform: `scaleX(${percent / 100})`, background: completionColor(percent) }} /></span><b style={{ color: completionColor(percent) }}>{percent}%</b></span></td>
              <td data-num><b>{row.ok.length}</b>{row.planned ? <small>/{row.planned}</small> : null}</td>
              <td data-num>{fmt(row.ok.reduce((n, set) => n + (set.reps ?? 0), 0))}</td>
              <td data-num>{kgLabel(Math.max(0, ...row.ok.map(kgOf)), 1)}</td>
              <td data-num>{kgLabel(row.ok.reduce((n, set) => n + (set.reps ?? 0) * kgOf(set), 0))}</td>
              <td data-num>{fmt(avg(row.ok.map(set => set.rpe).filter((v): v is number => v != null)), 1)}</td>
            </tr>;
          })}</tbody>
        </table>
      </div>
    </section>

    <WorkoutHeatmap execution={execution} />

    <WorkoutFeedbackForm key={`feedback:${execution.id}:${execution.version}`} execution={execution} own={feedbackOwn} />
  </div>;
}

/** Where the work went: volume (or sets) per muscle on the 3D body. Primary muscles count fully, secondary half. */
function WorkoutHeatmap({ execution }: { execution: Execution }) {
  const uiCopy = useUiCopy();

  const [metric, setMetric] = useState<"volume" | "sets">("volume");
  const ids = useMemo(() => execution.exercises.map(x => x.exerciseId), [execution.exercises]);
  const catalog = useExerciseNames(ids);
  const dictionaryLabel = useDictionaryLabel();
  const values = useMemo(() => {
    const map = new Map<string, number>();
    const add = (key: string, amount: number) => map.set(key, (map.get(key) ?? 0) + amount);
    for (const exercise of execution.exercises) {
      const info = catalog.get(exercise.exerciseId);
      if (!info) continue;
      const done = exercise.sets.filter(performed);
      const amount = metric === "sets" ? done.length : done.reduce((n, set) => n + (set.reps ?? 0) * kgOf(set), 0);
      if (!amount) continue;
      info.primaryMuscleKeys.forEach(key => add(key, amount));
      info.secondaryMuscleKeys.forEach(key => add(key, amount / 2));
    }
    return map;
  }, [catalog, execution.exercises, metric]);
  return <section className={styles.anSection}>
    <div className={styles.anSectionHead}>
      <h2>{uiCopy["exercises"]["detail"]["musclesWorked"]}</h2>
      <SegmentedControl aria-label={uiCopy["ui"]["Heatmap measure"]} selectedKeys={[metric]} onSelectionChange={keys => { const key = [...keys][0]; if (key) setMetric(key === "sets" ? "sets" : "volume"); }}>
        <Segment id="volume">{uiCopy["editor"]["sheet"]["volume"]["title"]}</Segment>
        <Segment id="sets">{uiCopy["editor"]["grid"]}</Segment>
      </SegmentedControl>
    </div>
    <div className={styles.anHeatmap}>
      <MuscleHeatmap values={values} label={key => dictionaryLabel("muscles", key)}
        format={value => metric === "sets" ? `${fmt(value, 1)} sets` : `${fmt(value)} kg`}
        caption={metric === "sets" ? "Sets done per muscle (secondary muscles count half)." : "Volume (load × reps) per muscle (secondary muscles count half)."} />
    </div>
  </section>;
}

export default function WorkoutLog() { const { occurrenceId } = useParams(); return <WorkoutDetail occurrenceId={occurrenceId!} />; }
