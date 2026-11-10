import { formatInterfaceText } from "~/shared/i18n/interface-format";
import { useT as useUiCopy } from "~/shared/i18n/AppLocale";
import {
  CalendarDays,
  Check,
  Clock,
  Dumbbell,
  Info,
  RefreshCw,
  Save,
  Shuffle,
  Target,
  WandSparkles,
} from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { PlanDto } from "@metrivum/api-client-web";
import {
  Alert,
  Button,
  Checkbox,
  Chip,
  ChipGroup,
  Disclosure,
  EmptyState,
  LoadingState,
  NumberInput,
  Option,
  PageHeader,
  Select,
  TextField,
} from "@metrivum/ui-web";
import { privateMeta } from "~/shared/i18n/site";
import {
  QuotaContextField,
  RequireFeature,
  useQuotaContext,
} from "~/shared/access";
import { useAccountKey, useApi } from "~/shared/session/AccountScope";
import { newIdempotencyKey } from "~/shared/http/transport";
import { useT } from "~/shared/i18n/AppLocale";
import { errorText } from "~/shared/lib/errorText";
import { trainingKeys } from "../queries";
import type {
  GenerationLevel,
  GenerationMode,
  GenerationOptions,
  GenerationPreview,
  GenerationRequest,
  GenerationState,
} from "./contracts";
import styles from "./GeneratorScreen.module.css";

export const meta = () => privateMeta("Generate program — Metrivum");

const base = "/api/v1/training/generator";
const initial: GenerationRequest = {
  mode: "Strength",
  level: "Beginner",
  sessionMinutes: 60,
  cycleDays: 7,
  daySlots: [1, 3, 5],
  cycles: 1,
  seed: 42,
  equipment: ["dumbbells", "incline-bench", "clear-walking-route"],
  skills: [],
  excludedExercises: [],
  priorityMuscles: [],
  preferredFamilies: [],
  progressRepetitions: false,
};
const label = (value: string) => value.replaceAll("-", " ");
const WEEKDAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

export default function GeneratorScreen() {
  return (
    <RequireFeature feature="training.generator.use">
      <GeneratorForm />
    </RequireFeature>
  );
}

export function GeneratorForm() {
  const uiCopy = useUiCopy();

  const api = useApi();
  const account = useAccountKey();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const messages = useT();
  const quotaContext = useQuotaContext();
  const quota = quotaContext.usage.data?.usage?.find(
    (limit) => limit.key === "training.generator.runs_per_period",
  );
  const [input, setInput] = useState(initial);
  const [name, setName] = useState("Generated program");
  const [preview, setPreview] = useState<GenerationPreview | null>(null);
  const [issues, setIssues] = useState<GenerationPreview["issues"]>([]);
  const [saveKey, setSaveKey] = useState(newIdempotencyKey);
  const [formChanged, setFormChanged] = useState(false);
  const [replacements, setReplacements] = useState<Record<string, string>>({});
  const options = useQuery({
    queryKey: [account, "training", "generator", "options"],
    queryFn: async ({ signal }) =>
      (await api<GenerationOptions>({ path: `${base}/options`, signal })).data,
  });
  const action = useMutation({
    mutationFn: async ({ path, body }: { path: string; body: unknown }) =>
      (
        await api<GenerationPreview>({
          method: "POST",
          path: `${base}/${path}`,
          json: body,
        })
      ).data,
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: [account, "usage"] });
      void queryClient.invalidateQueries({ queryKey: [account, "access"] });
      setIssues(result.issues);
      if (result.feasible) {
        setPreview(result);
        setFormChanged(false);
        setSaveKey(newIdempotencyKey());
        setReplacements({});
      }
    },
  });
  const save = useMutation({
    mutationFn: async () =>
      (
        await api<PlanDto>({
          method: "POST",
          path: `${base}/save-draft`,
          idempotencyKey: saveKey,
          json: {
            name: name.trim(),
            description:
              uiCopy["ui"][
                "Created from a reviewed deterministic recipe. Review and apply changes in the program builder."
              ],
            folderId: null,
            state: preview!.state,
          },
        })
      ).data,
    onSuccess: (plan) => {
      void queryClient.invalidateQueries({
        queryKey: trainingKeys.plans(account),
      });
      navigate(`/app/programs/${plan.id}/edit`);
    },
  });
  const busy = action.isPending || save.isPending;
  function update<K extends keyof GenerationRequest>(
    key: K,
    value: GenerationRequest[K],
  ) {
    setInput((current) => ({ ...current, [key]: value }));
    setFormChanged(true);
    setIssues([]);
  }
  function regenerate() {
    setIssues([]);
    action.mutate({
      path: "preview",
      body: {
        ...input,
        teamId: quotaContext.teamId,
        daySlots: input.daySlots.filter(
          (day) => day >= 1 && day <= input.cycleDays,
        ),
      },
    });
  }
  function lock(slot: string, selected: boolean) {
    if (!preview?.state) return;
    const state = preview.state;
    setPreview({
      ...preview,
      slots: preview.slots.map((x) =>
        x.key === slot ? { ...x, locked: selected } : x,
      ),
      state: {
        ...state,
        lockedSlots: selected
          ? [...state.lockedSlots, slot]
          : state.lockedSlots.filter((x) => x !== slot),
      },
    });
    setSaveKey(newIdempotencyKey());
  }
  function alternatives(
    state: GenerationState,
    role: string,
    currentId: string,
  ) {
    const level = ["Beginner", "Intermediate", "Advanced"].indexOf(
      state.input.level,
    );
    return (
      options.data?.exercises.filter(
        (x) =>
          x.id !== currentId &&
          x.role === role &&
          x.reviewed &&
          x.status !== "manual-only" &&
          x.minimumLevel <= level &&
          !state.input.excludedExercises.includes(x.id) &&
          x.requiredSkills.every((s) => state.input.skills.includes(s)) &&
          x.equipmentAnyOf.some((branch) =>
            branch.allOf.every((e) => state.input.equipment.includes(e)),
          ),
      ) ?? []
    );
  }
  const daySlots = input.daySlots.filter(
    (day) => day >= 1 && day <= input.cycleDays,
  );
  return (
    <div className={styles.page}>
      <PageHeader
        title={uiCopy["ui"]["Program generator"]}
        description={
          uiCopy["ui"][
            "Choose a goal and your schedule, review the generated program, then continue in the program builder."
          ]
        }
      />
      <QuotaContextField
        context={{
          ...quotaContext,
          setTeamId: (teamId) => {
            quotaContext.setTeamId(teamId);
            setPreview(null);
            setFormChanged(true);
          },
        }}
        disabled={busy}
      />
      {quota && (
        <Alert title={messages.access.limits[quota.key] ?? quota.key}>
          {quota.used} /{" "}
          {quota.maximum == null
            ? messages.dashboard.coach.unlimited
            : quota.maximum}
        </Alert>
      )}
      {options.isPending ? (
        <LoadingState
          label={uiCopy["ui"]["Loading reviewed exercise options…"]}
        />
      ) : null}
      {options.error ? (
        <Alert tone="danger" title={errorText(messages, options.error)}>
          <Button variant="secondary" onPress={() => void options.refetch()}>
            {uiCopy["ui"]["Retry"]}
          </Button>
        </Alert>
      ) : null}
      {options.data?.exercises.length === 0 ? (
        <Alert
          tone="warning"
          title={
            uiCopy["ui"][
              "No reviewed exercises are available in this catalog. Ask the coach administrator to restore or review the canonical exercise records."
            ]
          }
        />
      ) : null}
      {options.data && options.data.exercises.length > 0 ? (
        <div className={styles.layout}>
          {/* Settings on the left, kept in view while the preview on the right scrolls. */}
          <form
            className={styles.settings}
            onSubmit={(event) => {
              event.preventDefault();
              regenerate();
            }}
          >
            <fieldset disabled={busy} className={styles.section}>
              <legend className={styles.sectionTitle}>
                <Target aria-hidden="true" />
                {uiCopy["editor"]["week"]["goal"]}
              </legend>
              <ChipField label={uiCopy["ui"]["Training goal"]}>
                {(id) => (
                  <ChipGroup
                    aria-labelledby={id}
                    disallowEmptySelection
                    selectedKeys={[input.mode]}
                    onSelectionChange={(keys) => {
                      const key = [...keys][0];
                      if (key) update("mode", key as GenerationMode);
                    }}
                  >
                    {["Strength", "Hypertrophy", "Cardio", "Mixed"].map((x) => (
                      <Chip key={x} id={x}>
                        {x}
                      </Chip>
                    ))}
                  </ChipGroup>
                )}
              </ChipField>
              <ChipField
                label={uiCopy["profile"]["fields"]["TrainingExperience"]!}
              >
                {(id) => (
                  <ChipGroup
                    aria-labelledby={id}
                    disallowEmptySelection
                    selectedKeys={[input.level]}
                    onSelectionChange={(keys) => {
                      const key = [...keys][0];
                      if (key) update("level", key as GenerationLevel);
                    }}
                  >
                    {["Beginner", "Intermediate", "Advanced"].map((x) => (
                      <Chip key={x} id={x}>
                        {x}
                      </Chip>
                    ))}
                  </ChipGroup>
                )}
              </ChipField>
            </fieldset>

            <fieldset disabled={busy} className={styles.section}>
              <legend className={styles.sectionTitle}>
                <CalendarDays aria-hidden="true" />
                {uiCopy["ui"]["Schedule"]}
              </legend>
              <div className={styles.numbers}>
                <NumberInput
                  label={uiCopy["ui"]["Session length"]}
                  unit="min"
                  placeholder="60"
                  minValue={10}
                  maxValue={180}
                  value={input.sessionMinutes}
                  onChange={(v) => update("sessionMinutes", v)}
                  formatOptions={{ maximumFractionDigits: 0 }}
                />
              </div>
              {/* A generated program is one week: pick its training days; the coach can extend it in the editor. */}
              <ChipField
                label={uiCopy["ui"]["Workout days"]}
                hint={uiCopy["ui"]["Days of the week with a workout."]}
              >
                {(id) => (
                  <ChipGroup
                    aria-labelledby={id}
                    selectionMode="multiple"
                    selectedKeys={daySlots.map(String)}
                    onSelectionChange={(keys) =>
                      update(
                        "daySlots",
                        [...keys].map(Number).sort((a, b) => a - b),
                      )
                    }
                  >
                    {WEEKDAYS.map((name, i) => (
                      <Chip key={i + 1} id={String(i + 1)} aria-label={name}>
                        {name.slice(0, 3)}
                      </Chip>
                    ))}
                  </ChipGroup>
                )}
              </ChipField>
            </fieldset>

            <fieldset disabled={busy} className={styles.section}>
              <legend className={styles.sectionTitle}>
                <Dumbbell aria-hidden="true" />
                {uiCopy["ui"]["Equipment and space"]}
              </legend>
              <ChipField label={uiCopy["access"]["reasons"]["available"]!}>
                {(id) => (
                  <ChipGroup
                    aria-labelledby={id}
                    selectionMode="multiple"
                    selectedKeys={input.equipment}
                    onSelectionChange={(keys) =>
                      update(
                        "equipment",
                        options.data!.equipment.filter((x) => keys.has(x)),
                      )
                    }
                  >
                    {options.data.equipment.map((x) => (
                      <Chip key={x} id={x}>
                        {label(x)}
                      </Chip>
                    ))}
                  </ChipGroup>
                )}
              </ChipField>
            </fieldset>

            <Disclosure
              title={uiCopy["ui"]["Skills, priorities and exclusions"]}
              className={styles.more}
            >
              <fieldset disabled={busy} className={styles.section}>
                {options.data.skills.length ? (
                  <ChipField label={uiCopy["ui"]["Confirmed exercise skills"]}>
                    {(id) => (
                      <ChipGroup
                        aria-labelledby={id}
                        selectionMode="multiple"
                        selectedKeys={input.skills}
                        onSelectionChange={(keys) =>
                          update(
                            "skills",
                            options.data!.skills.filter((x) => keys.has(x)),
                          )
                        }
                      >
                        {options.data.skills.map((x) => (
                          <Chip key={x} id={x}>
                            {label(x)}
                          </Chip>
                        ))}
                      </ChipGroup>
                    )}
                  </ChipField>
                ) : null}
                {options.data.muscles.length ? (
                  <ChipField
                    label={uiCopy["ui"]["Priority muscles"]}
                    hint={
                      uiCopy["ui"]["Up to 3. Movement roles stay balanced."]
                    }
                  >
                    {(id) => (
                      <ChipGroup
                        aria-labelledby={id}
                        selectionMode="multiple"
                        selectedKeys={input.priorityMuscles}
                        onSelectionChange={(keys) => {
                          const next = options.data!.muscles.filter((x) =>
                            keys.has(x),
                          );
                          if (next.length <= 3) update("priorityMuscles", next);
                        }}
                      >
                        {options.data.muscles.map((x) => (
                          <Chip
                            key={x}
                            id={x}
                            isDisabled={
                              !input.priorityMuscles.includes(x) &&
                              input.priorityMuscles.length >= 3
                            }
                          >
                            {label(x)}
                          </Chip>
                        ))}
                      </ChipGroup>
                    )}
                  </ChipField>
                ) : null}
                {options.data.families.length ? (
                  <ChipField
                    label={uiCopy["ui"]["Preferred exercise families"]}
                  >
                    {(id) => (
                      <ChipGroup
                        aria-labelledby={id}
                        selectionMode="multiple"
                        selectedKeys={input.preferredFamilies}
                        onSelectionChange={(keys) =>
                          update(
                            "preferredFamilies",
                            options.data!.families.filter((x) => keys.has(x)),
                          )
                        }
                      >
                        {options.data.families.map((x) => (
                          <Chip key={x} id={x}>
                            {label(x)}
                          </Chip>
                        ))}
                      </ChipGroup>
                    )}
                  </ChipField>
                ) : null}
                <ChipField label={uiCopy["ui"]["Exclude exercises"]}>
                  {(id) => (
                    <ChipGroup
                      aria-labelledby={id}
                      selectionMode="multiple"
                      selectedKeys={input.excludedExercises}
                      onSelectionChange={(keys) =>
                        update(
                          "excludedExercises",
                          options
                            .data!.exercises.filter((x) => keys.has(x.id))
                            .map((x) => x.id),
                        )
                      }
                    >
                      {options.data.exercises.map((x) => (
                        <Chip key={x.id} id={x.id}>
                          {x.name}
                        </Chip>
                      ))}
                    </ChipGroup>
                  )}
                </ChipField>
                <NumberInput
                  label={uiCopy["ui"]["Seed"]}
                  description={
                    uiCopy["ui"][
                      "The same seed and settings always give the same program."
                    ]
                  }
                  placeholder="42"
                  value={input.seed}
                  onChange={(v) => update("seed", v)}
                  formatOptions={{
                    maximumFractionDigits: 0,
                    useGrouping: false,
                  }}
                />
              </fieldset>
            </Disclosure>

            <div className={styles.submit}>
              {preview ? (
                <p className={styles.muted}>
                  {
                    uiCopy["ui"][
                      "Regenerating applies these settings and clears all locks and exercise choices."
                    ]
                  }
                </p>
              ) : null}
              <Button
                type="submit"
                variant="primary"
                iconStart={preview ? <RefreshCw /> : <WandSparkles />}
                loading={action.isPending}
                isDisabled={save.isPending || daySlots.length === 0}
                block
              >
                {preview
                  ? uiCopy["ui"]["Regenerate structure"]
                  : uiCopy["ui"]["Preview program"]}
              </Button>
            </div>
          </form>

          <div className={styles.result}>
            {action.error || save.error ? (
              <Alert
                tone="danger"
                title={errorText(messages, action.error ?? save.error)}
              />
            ) : null}
            {issues.length > 0 ? (
              <div role="alert" className={styles.issues}>
                {issues.map((x, index) => (
                  <Alert
                    key={`${x.target}-${index}`}
                    tone="warning"
                    title={`${x.code}: ${x.message}`}
                  />
                ))}
              </div>
            ) : null}
            {!preview?.state ? (
              <div className={styles.empty}>
                <EmptyState
                  icon={<WandSparkles />}
                  title={uiCopy["ui"]["Your program appears here"]}
                  description={
                    uiCopy["ui"][
                      "Pick a goal, the workout days and your equipment, then preview. Nothing is saved until you choose to."
                    ]
                  }
                />
              </div>
            ) : (
              <section
                className={styles.preview}
                aria-label={uiCopy["ui"]["Program preview"]}
              >
                <header className={styles.previewHead}>
                  <div>
                    <h2>
                      {uiCopy["ui"]["Preview ·"]} {preview.state.input.mode}
                    </h2>
                    <p className={styles.muted}>
                      {uiCopy["ui"]["One week · workouts on"]}{" "}
                      {preview.state.input.daySlots
                        .map(
                          (day) =>
                            WEEKDAYS[day - 1]?.slice(0, 3) ?? `day ${day}`,
                        )
                        .join(", ")}{" "}
                      {uiCopy["ui"]["· seed"]} {preview.state.input.seed}.
                    </p>
                  </div>
                  <Button
                    variant="secondary"
                    iconStart={<Shuffle />}
                    isDisabled={busy || formChanged}
                    onPress={() =>
                      action.mutate({
                        path: "reshuffle",
                        body: {
                          state: preview.state,
                          seed: preview.state!.selectionSeed + 1,
                        },
                      })
                    }
                  >
                    {uiCopy["ui"]["Reshuffle unlocked exercises"]}
                  </Button>
                </header>
                {formChanged ? (
                  <Alert
                    tone="warning"
                    title={
                      uiCopy["ui"][
                        "Settings changed. Regenerate the structure to apply them before saving."
                      ]
                    }
                  />
                ) : null}
                {preview.state.input.daySlots.map((day, index) => {
                  const duration = preview.durations.find(
                    (x) => x.dayNumber === day,
                  )!;
                  return (
                    <article className={styles.session} key={day}>
                      <header className={styles.sessionHead}>
                        <h3>
                          {uiCopy["editor"]["sheet"]["addDay"]} {day}
                        </h3>
                        <span className={styles.duration}>
                          <Clock aria-hidden="true" />
                          {uiCopy["ui"]["about"]}{" "}
                          {Math.ceil(duration.totalSeconds / 60)} min
                        </span>
                      </header>
                      {preview.slots
                        .filter((x) =>
                          x.key.startsWith(`session-${index + 1}/`),
                        )
                        .map((slot) => {
                          const available = alternatives(
                            preview.state!,
                            slot.role,
                            slot.exerciseId,
                          );
                          return (
                            <div
                              key={slot.key}
                              className={styles.slot}
                              data-locked={slot.locked || undefined}
                            >
                              <div className={styles.slotText}>
                                <strong>{slot.name}</strong>
                                <span className={styles.prescription}>
                                  {slot.prescription}
                                  {slot.repetitionCounting === "per-side"
                                    ? uiCopy["ui"][" · per side"]
                                    : ""}
                                </span>
                                <small className={styles.muted}>
                                  {label(slot.role)}
                                  {slot.muscles.length
                                    ? ` · ${slot.muscles.map(label).join(", ")}`
                                    : ""}{" "}
                                  ·{" "}
                                  {slot.equipment.map(label).join(", ") ||
                                    uiCopy["ui"]["no equipment"]}
                                </small>
                              </div>
                              <div className={styles.slotActions}>
                                <Checkbox
                                  aria-label={formatInterfaceText(
                                    uiCopy["ui"]["Lock {0} on day {1}"],
                                    [slot.name, day],
                                  )}
                                  isSelected={slot.locked}
                                  isDisabled={busy || formChanged}
                                  onChange={(v) => lock(slot.key, v)}
                                >
                                  {uiCopy["ui"]["Lock"]}
                                </Checkbox>
                                <Select
                                  aria-label={formatInterfaceText(
                                    uiCopy["ui"]["Alternative for {0}"],
                                    [slot.name],
                                  )}
                                  selectedKey={replacements[slot.key] ?? "auto"}
                                  isDisabled={
                                    busy ||
                                    slot.locked ||
                                    formChanged ||
                                    available.length === 0
                                  }
                                  onSelectionChange={(key) =>
                                    setReplacements((current) => ({
                                      ...current,
                                      [slot.key]: String(key),
                                    }))
                                  }
                                >
                                  <Option id="auto">
                                    {uiCopy["ui"]["Any eligible alternative"]}
                                  </Option>
                                  {available.map((x) => (
                                    <Option key={x.id} id={x.id}>
                                      {x.name}
                                    </Option>
                                  ))}
                                </Select>
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  isDisabled={
                                    busy ||
                                    slot.locked ||
                                    formChanged ||
                                    available.length === 0
                                  }
                                  onPress={() =>
                                    action.mutate({
                                      path: "replace-exercise",
                                      body: {
                                        state: preview.state,
                                        slot: slot.key,
                                        exerciseId:
                                          replacements[slot.key] &&
                                          replacements[slot.key] !== "auto"
                                            ? replacements[slot.key]
                                            : null,
                                        seed: preview.state!.selectionSeed + 1,
                                      },
                                    })
                                  }
                                >
                                  {uiCopy["ui"]["Replace exercise"]}
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                      <TimeBar duration={duration} />
                    </article>
                  );
                })}
                {/* What the recipe assumed, always visible: short notes, then the versions that reproduce this result. */}
                <section
                  className={styles.notes}
                  aria-labelledby="generator-notes"
                >
                  <h3 id="generator-notes" className={styles.notesTitle}>
                    <Info aria-hidden="true" />
                    {uiCopy["ui"]["How this program was built"]}
                  </h3>
                  <ul className={styles.assumptions}>
                    {preview.assumptions.map((x) => (
                      <li key={x}>
                        <Check aria-hidden="true" />
                        <span>{x}</span>
                      </li>
                    ))}
                  </ul>
                  <dl className={styles.versions}>
                    <div>
                      <dt>{uiCopy["ui"]["Recipe"]}</dt>
                      <dd>{preview.state.recipeVersion}</dd>
                    </div>
                    <div>
                      <dt>{uiCopy["ui"]["Metadata"]}</dt>
                      <dd>{preview.state.metadataVersion}</dd>
                    </div>
                    <div>
                      <dt>{uiCopy["ui"]["Dataset"]}</dt>
                      <dd title={preview.state.datasetVersion}>
                        {preview.state.datasetVersion}
                      </dd>
                    </div>
                    <div>
                      <dt>{uiCopy["ui"]["Seed"]}</dt>
                      <dd>{preview.state.input.seed}</dd>
                    </div>
                  </dl>
                </section>
                <div className={styles.save}>
                  <div className={styles.saveText}>
                    <h3>{uiCopy["ui"]["Save as a draft"]}</h3>
                    <p className={styles.muted}>
                      {
                        uiCopy["ui"][
                          "A private draft opens in the program builder, where you set loads and assign it."
                        ]
                      }
                    </p>
                  </div>
                  <TextField
                    label={uiCopy["training"]["import"]["commitName"]}
                    placeholder={uiCopy["common"]["ph"]["programName"]}
                    value={name}
                    maxLength={200}
                    onChange={(value) => {
                      setName(value);
                      setSaveKey(newIdempotencyKey());
                    }}
                    isDisabled={busy}
                  />
                  <Button
                    variant="primary"
                    iconStart={<Save />}
                    loading={save.isPending}
                    isDisabled={
                      action.isPending ||
                      formChanged ||
                      !preview.feasible ||
                      !name.trim()
                    }
                    onPress={() => save.mutate()}
                  >
                    {uiCopy["ui"]["Save draft and open builder"]}
                  </Button>
                </div>
              </section>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** A label above a chip row, tied to it for assistive technology. */
function ChipField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: (labelId: string) => ReactNode;
}) {
  const id = useId();
  return (
    <div className={styles.chipField}>
      <span id={id} className={styles.label}>
        {label}
      </span>
      {children(id)}
      {hint ? <span className={styles.hint}>{hint}</span> : null}
    </div>
  );
}

const TIME_PARTS = [
  ["generalWarmupSeconds", "Warm-up", "warmup"],
  ["specificWarmupSeconds", "Ramp-up sets", "ramp"],
  ["workSeconds", "Work", "work"],
  ["restSeconds", "Rest", "rest"],
  ["setupSeconds", "Setup", "setup"],
  ["bufferSeconds", "Buffer", "buffer"],
] as const;

/** Where the session's time goes: one proportional bar with the minutes listed under it. */
function TimeBar({
  duration,
}: {
  duration: GenerationPreview["durations"][number];
}) {
  const uiCopy = useUiCopy();

  const total = TIME_PARTS.reduce((sum, [key]) => sum + duration[key], 0) || 1;
  const minutes = (seconds: number) =>
    `${Math.max(1, Math.round(seconds / 60))} min`;
  return (
    <div className={styles.time}>
      <div className={styles.timeBar} aria-hidden="true">
        {TIME_PARTS.map(([key, , tone]) =>
          duration[key] > 0 ? (
            <span
              key={key}
              data-tone={tone}
              style={{ flexGrow: duration[key] / total }}
            />
          ) : null,
        )}
      </div>
      <ul
        className={styles.timeLegend}
        aria-label={uiCopy["profile"]["fields"]["AvailableSessionDuration"]}
      >
        {TIME_PARTS.map(([key, name, tone]) =>
          duration[key] > 0 ? (
            <li key={key}>
              <span
                className={styles.swatch}
                data-tone={tone}
                aria-hidden="true"
              />
              {name} <strong>{minutes(duration[key])}</strong>
            </li>
          ) : null,
        )}
      </ul>
    </div>
  );
}
