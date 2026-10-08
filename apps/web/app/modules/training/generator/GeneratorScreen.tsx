import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { PlanDto } from "@trainflow/api-client-web";
import { Alert, Button, Checkbox, LoadingState, Option, PageHeader, Select, TextField } from "@trainflow/ui-web";
import { RequireFeature } from "~/shared/access";
import { useAccountKey, useApi } from "~/shared/session/AccountScope";
import { newIdempotencyKey } from "~/shared/http/transport";
import { useT } from "~/shared/i18n/AppLocale";
import { errorText } from "~/shared/lib/errorText";
import { trainingKeys } from "../queries";
import type { GenerationLevel, GenerationMode, GenerationOptions, GenerationPreview, GenerationRequest, GenerationState } from "./contracts";
import styles from "./GeneratorScreen.module.css";

const base = "/api/v1/training/generator";
const initial: GenerationRequest = { mode: "Strength", level: "Beginner", sessionMinutes: 60, cycleDays: 7, daySlots: [1, 3, 5], cycles: 3, seed: 42,
  equipment: ["dumbbells", "incline-bench", "clear-walking-route"], skills: [], excludedExercises: [], priorityMuscles: [], preferredFamilies: [], progressRepetitions: false };
const label = (value: string) => value.replaceAll("-", " ");

export default function GeneratorScreen() {
  return <RequireFeature feature="training.generator.use"><GeneratorForm /></RequireFeature>;
}

export function GeneratorForm() {
  const api = useApi();
  const account = useAccountKey();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const messages = useT();
  const [input, setInput] = useState(initial);
  const [days, setDays] = useState("1, 3, 5");
  const [name, setName] = useState("Generated program");
  const [preview, setPreview] = useState<GenerationPreview | null>(null);
  const [issues, setIssues] = useState<GenerationPreview["issues"]>([]);
  const [saveKey, setSaveKey] = useState(newIdempotencyKey);
  const [formChanged, setFormChanged] = useState(false);
  const [replacements, setReplacements] = useState<Record<string, string>>({});
  const options = useQuery({ queryKey: [account, "training", "generator", "options"],
    queryFn: async ({ signal }) => (await api<GenerationOptions>({ path: `${base}/options`, signal })).data });
  const action = useMutation({
    mutationFn: async ({ path, body }: { path: string; body: unknown }) => (await api<GenerationPreview>({ method: "POST", path: `${base}/${path}`, json: body })).data,
    onSuccess: (result) => {
      setIssues(result.issues);
      if (result.feasible) { setPreview(result); setFormChanged(false); setSaveKey(newIdempotencyKey()); setReplacements({}); }
    },
  });
  const save = useMutation({
    mutationFn: async () => (await api<PlanDto>({ method: "POST", path: `${base}/save-draft`, idempotencyKey: saveKey,
      json: { name: name.trim(), description: "Created from a reviewed deterministic recipe. Review and publish in the program builder.", folderId: null, state: preview!.state } })).data,
    onSuccess: (plan) => { void queryClient.invalidateQueries({ queryKey: trainingKeys.plans(account) }); navigate(`/app/programs/${plan.id}/edit`); },
  });
  const busy = action.isPending || save.isPending;
  function update<K extends keyof GenerationRequest>(key: K, value: GenerationRequest[K]) {
    setInput(current => ({ ...current, [key]: value })); setFormChanged(true); setIssues([]);
  }
  function toggle(key: "equipment" | "skills" | "excludedExercises" | "priorityMuscles" | "preferredFamilies", value: string, selected: boolean) {
    update(key, selected ? [...input[key], value] : input[key].filter(x => x !== value));
  }
  function regenerate() {
    setIssues([]);
    action.mutate({ path: "preview", body: { ...input, daySlots: days.split(",").map(x => Number(x.trim())) } });
  }
  function lock(slot: string, selected: boolean) {
    if (!preview?.state) return;
    const state = preview.state;
    setPreview({ ...preview, slots: preview.slots.map(x => x.key === slot ? { ...x, locked: selected } : x),
      state: { ...state, lockedSlots: selected ? [...state.lockedSlots, slot] : state.lockedSlots.filter(x => x !== slot) } });
    setSaveKey(newIdempotencyKey());
  }
  function alternatives(state: GenerationState, role: string, currentId: string) {
    const level = ["Beginner", "Intermediate", "Advanced"].indexOf(state.input.level);
    return options.data?.exercises.filter(x => x.id !== currentId && x.role === role && x.reviewed && x.status !== "manual-only"
      && x.minimumLevel <= level && !state.input.excludedExercises.includes(x.id)
      && x.requiredSkills.every(s => state.input.skills.includes(s))
      && x.equipmentAnyOf.some(branch => branch.allOf.every(e => state.input.equipment.includes(e)))) ?? [];
  }
  return <main className={styles.page}>
    <PageHeader title="Program generator" description="Choose a reviewed recipe, inspect the result, then continue in the existing program builder." />
    <Link to="/app/programs">← Programs</Link>
    {options.isPending ? <LoadingState label="Loading reviewed exercise options…" /> : null}
    {options.error ? <Alert tone="danger" title={errorText(messages, options.error)}><Button variant="secondary" onPress={() => void options.refetch()}>Retry</Button></Alert> : null}
    {options.data?.exercises.length === 0 ? <Alert tone="warning" title="No reviewed exercises are available in this catalog. Ask the coach administrator to restore or review the canonical exercise records." /> : null}
    {options.data && options.data.exercises.length > 0 ? <>
      <form className={styles.form} onSubmit={event => { event.preventDefault(); regenerate(); }}>
        <fieldset disabled={busy} className={styles.fields}>
          <legend>Recipe and schedule</legend>
          <Select label="Training goal" selectedKey={input.mode} onSelectionChange={key => update("mode", key as GenerationMode)}>
            {["Strength", "Hypertrophy", "Cardio", "Mixed"].map(x => <Option key={x} id={x}>{x}</Option>)}
          </Select>
          <Select label="Experience" selectedKey={input.level} onSelectionChange={key => update("level", key as GenerationLevel)}>
            {["Beginner", "Intermediate", "Advanced"].map(x => <Option key={x} id={x}>{x}</Option>)}
          </Select>
          <TextField label="Minutes per session" description="10–180 minutes" type="number" value={String(input.sessionMinutes)} onChange={v => update("sessionMinutes", Number(v))} />
          <TextField label="Days per cycle" description="1–28 days" type="number" value={String(input.cycleDays)} onChange={v => update("cycleDays", Number(v))} />
          <TextField label="Workout day positions" description="Comma-separated positions in each cycle, such as 1, 4, 8 for a 10-day cycle." value={days} onChange={v => { setDays(v); setFormChanged(true); }} />
          <TextField label="Number of cycles" description="1–12 cycles" type="number" value={String(input.cycles)} onChange={v => update("cycles", Number(v))} />
          <TextField label="Seed" type="number" value={String(input.seed)} onChange={v => update("seed", Number(v))} />
          <Checkbox isSelected={input.progressRepetitions} onChange={v => update("progressRepetitions", v)}>Add up to two repetitions across subsequent cycles</Checkbox>
        </fieldset>
        <fieldset disabled={busy} className={styles.checks}><legend>Available equipment and space</legend>
          {options.data.equipment.map(x => <Checkbox key={x} isSelected={input.equipment.includes(x)} onChange={v => toggle("equipment", x, v)}>{label(x)}</Checkbox>)}
        </fieldset>
        <details><summary>Skills, priorities and exclusions</summary>
          <fieldset disabled={busy} className={styles.checks}><legend>Confirmed exercise skills</legend>
            {options.data.skills.map(x => <Checkbox key={x} isSelected={input.skills.includes(x)} onChange={v => toggle("skills", x, v)}>{label(x)}</Checkbox>)}
          </fieldset>
          <fieldset disabled={busy} className={styles.checks}><legend>Priority muscles (up to 3; balanced movement roles remain)</legend>
            {options.data.muscles.map(x => <Checkbox key={x} isSelected={input.priorityMuscles.includes(x)} isDisabled={!input.priorityMuscles.includes(x) && input.priorityMuscles.length >= 3} onChange={v => toggle("priorityMuscles", x, v)}>{label(x)}</Checkbox>)}
          </fieldset>
          <fieldset disabled={busy} className={styles.checks}><legend>Preferred exercise families</legend>
            {options.data.families.map(x => <Checkbox key={x} isSelected={input.preferredFamilies.includes(x)} onChange={v => toggle("preferredFamilies", x, v)}>{label(x)}</Checkbox>)}
          </fieldset>
          <fieldset disabled={busy} className={styles.checks}><legend>Exclude exercises</legend>
            {options.data.exercises.map(x => <Checkbox key={x.id} isSelected={input.excludedExercises.includes(x.id)} onChange={v => toggle("excludedExercises", x.id, v)}>{x.name}</Checkbox>)}
          </fieldset>
        </details>
        {preview ? <p>Regenerate structure applies these form settings and clears all locks and exercise choices.</p> : null}
        <Button type="submit" variant="primary" loading={action.isPending} isDisabled={save.isPending}>{preview ? "Regenerate structure" : "Preview program"}</Button>
      </form>
      {action.error || save.error ? <Alert tone="danger" title={errorText(messages, action.error ?? save.error)} /> : null}
      {issues.length > 0 ? <div role="alert">{issues.map((x, index) => <Alert key={`${x.target}-${index}`} tone="warning" title={`${x.code}: ${x.message}`} />)}</div> : null}
      {preview?.state ? <section className={styles.preview} aria-label="Program preview">
        <h2>Preview · {preview.state.input.mode}</h2>
        <p>{preview.state.input.cycles} cycles × {preview.state.input.cycleDays} days · workout positions {preview.state.input.daySlots.join(", ")} · seed {preview.state.input.seed}. Prescriptions below show the final cycle.</p>
        {formChanged ? <Alert tone="warning" title="Form settings changed. Regenerate the structure to apply them before saving." /> : null}
        <Button variant="secondary" isDisabled={busy || formChanged} onPress={() => action.mutate({ path: "reshuffle", body: { state: preview.state, seed: preview.state!.selectionSeed + 1 } })}>Reshuffle unlocked exercises</Button>
        {preview.state.input.daySlots.map((day, index) => {
          const duration = preview.durations.find(x => x.dayNumber === day)!;
          return <article className={styles.session} key={day}>
            <h3>Day {day} · approximately {Math.ceil(duration.totalSeconds / 60)} min</h3>
            <details><summary>Time breakdown (longest cycle)</summary><p>General warm-up {duration.generalWarmupSeconds / 60} min · specific warm-up {duration.specificWarmupSeconds / 60} min · work {(duration.workSeconds / 60).toFixed(1)} min · rest {(duration.restSeconds / 60).toFixed(1)} min · setup {(duration.setupSeconds / 60).toFixed(1)} min · buffer {duration.bufferSeconds / 60} min</p></details>
            {preview.slots.filter(x => x.key.startsWith(`session-${index + 1}/`)).map(slot => {
              const available = alternatives(preview.state!, slot.role, slot.exerciseId);
              return <div key={slot.key} className={styles.slot}>
                <div><strong>{slot.name}</strong><p>{label(slot.role)} · {slot.prescription}{slot.repetitionCounting === "per-side" ? " · per side" : ""}</p><small>{slot.muscles.map(label).join(", ")} · equipment: {slot.equipment.map(label).join(", ") || "none"}</small></div>
                <div className={styles.actions}>
                  <Checkbox aria-label={`Lock ${slot.name} on day ${day}`} isSelected={slot.locked} isDisabled={busy || formChanged} onChange={v => lock(slot.key, v)}>Lock exercise</Checkbox>
                  <Select label={`Alternative for ${slot.name}`} selectedKey={replacements[slot.key] ?? "auto"} isDisabled={busy || slot.locked || formChanged || available.length === 0}
                    onSelectionChange={key => setReplacements(current => ({ ...current, [slot.key]: String(key) }))}>
                    <Option id="auto">Choose eligible alternative</Option>{available.map(x => <Option key={x.id} id={x.id}>{x.name}</Option>)}
                  </Select>
                  <Button variant="secondary" isDisabled={busy || slot.locked || formChanged || available.length === 0} onPress={() => action.mutate({ path: "replace-exercise", body: { state: preview.state, slot: slot.key, exerciseId: replacements[slot.key] && replacements[slot.key] !== "auto" ? replacements[slot.key] : null, seed: preview.state!.selectionSeed + 1 } })}>Replace exercise</Button>
                  {!slot.locked && available.length === 0 ? <small>No eligible alternative for the current constraints.</small> : null}
                </div>
              </div>;
            })}
          </article>;
        })}
        <details><summary>Recipe assumptions and reproducibility</summary><ul>{preview.assumptions.map(x => <li key={x}>{x}</li>)}</ul><p>Recipe: {preview.state.recipeVersion}<br />Metadata: {preview.state.metadataVersion}<br />Dataset: <code className={styles.hash}>{preview.state.datasetVersion}</code></p></details>
        <div className={styles.save}>
          <TextField label="Program name" value={name} maxLength={200} onChange={value => { setName(value); setSaveKey(newIdempotencyKey()); }} isDisabled={busy} />
          <p>Save creates a private draft. Continue editing sets, loads and structure in the program builder, then publish and assign explicitly.</p>
          <Button variant="primary" loading={save.isPending} isDisabled={action.isPending || formChanged || !preview.feasible || !name.trim()} onPress={() => save.mutate()}>Save draft and open builder</Button>
        </div>
      </section> : null}
    </> : null}
  </main>;
}
