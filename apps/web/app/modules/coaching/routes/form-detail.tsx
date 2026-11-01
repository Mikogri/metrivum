import { privateMeta } from "~/shared/i18n/site";

export const meta = ({ location }: { location: { pathname: string } }) =>
  privateMeta(`${location.pathname.endsWith("/new") ? "New form" : "Edit form"} — Metrivum`);

import { CalendarDays, MoreHorizontal, Monitor, PenLine, Play, Plus, Smartphone, Trash2, X } from "lucide-react";
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useNavigate, useParams, useSearchParams } from "react-router";
import type { Schema } from "@metrivum/api-client-web";
import { Alert, Badge, Button, DropdownMenu, DropdownMenuItem, DropdownMenuTrigger, toast, IconButton, NumberInput, Option, PageHeader, Segment, SegmentedControl, Select, Switch, TextField } from "@metrivum/ui-web";
import { useUnsavedWorkGuard } from "~/shared/session/dirty-guard";
import { useCoachingMutation, useCoachingQuery } from "../api";
import { DraftNavigationGuard, EditableResource, Failure, Loading, MutationError } from "../components";
import { FormAnswerFields, type Answers, type Definition, type Question } from "../form-fields";
import { equipmentValue, profileQuestion, questionType } from "../form-model";
import styles from "../form-builder.module.css";

type Template = Schema<"FormTemplateDto">;
type Purpose = "Application" | "CheckIn";
type Section = Definition["sections"][number];

const TYPES: [Question["type"], string][] = [
  ["ShortText", "Short text"],
  ["LongText", "Long text"],
  ["Number", "Number"],
  ["YesNo", "Yes / no"],
  ["SingleChoice", "Single choice"],
  ["MultiChoice", "Multiple choice"],
  ["Scale", "Scale"],
  ["Date", "Date"],
];
const systemFields = ["Sex", "Height", "Weight", "BodyFat", "HrMax", "Vo2Max", "TrainingExperience", "ActivityLevel", "AvailableEquipment", "PreferredTrainingDays", "SessionsPerWeek", "AvailableSessionDuration", "Sleep", "Stress", "InjuriesLimitationsPainNotes", "AdditionalNotes"] as const;
const newKey = () => crypto.randomUUID();
const blankQuestion = (type: Question["type"], order: number): Question => ({ key: newKey(), label: "", required: false, order, ...questionType(type), type }) as Question;
const blankSection = (order: number): Section => ({ key: newKey(), title: "", description: "", order, questions: [] });

/**
 * What the client will see in place of the answer, drawn statically. Choice options are the
 * exception: they are edited right here, in the list the client will pick from.
 */
function AnswerShape({ q, locked, change }: { q: Question; locked: boolean; change: (value: Partial<Question>) => void }) {
  if (q.type === "ShortText" || q.type === "LongText" || q.type === "Number")
    return (
      <div className={styles.fake} data-tall={q.type === "LongText" || undefined}>
        {q.type === "Number" ? `0${q.unit ? ` ${q.unit}` : ""}` : q.type === "LongText" ? "Long answer" : "Short answer"}
      </div>
    );
  if (q.type === "Date")
    return (
      <div className={styles.fake}>
        dd / mm / yyyy <CalendarDays aria-hidden="true" />
      </div>
    );
  if (q.type === "YesNo")
    return (
      <div className={styles.pills}>
        <span>Yes</span>
        <span>No</span>
      </div>
    );
  if (q.type === "Scale") {
    const min = Number(q.min ?? 1);
    const max = Number(q.max ?? 10);
    const steps = max - min >= 0 && max - min <= 10 ? Array.from({ length: max - min + 1 }, (_, i) => min + i) : [min, "…", max];
    return (
      <div className={styles.scale}>
        <div className={styles.pills}>
          {steps.map((n, i) => (
            <span key={i}>{n}</span>
          ))}
        </div>
        <div className={styles.scaleLabels}>
          <span>{q.minLabel || "Minimum"}</span>
          <span>{q.maxLabel || "Maximum"}</span>
        </div>
      </div>
    );
  }
  if (q.type === "SingleChoice" || q.type === "MultiChoice") {
    const equipment = q.systemField === "AvailableEquipment";
    return (
      <ul className={styles.options}>
        {q.choices?.map((c, n) => (
          <li key={equipment ? n : c.key}>
            <span className={styles.mark} data-kind={q.type === "MultiChoice" ? "box" : "radio"} aria-hidden="true" />
            <input
              className={styles.inlineInput}
              aria-label={`Option ${n + 1}`}
              placeholder={`Option ${n + 1}`}
              required
              disabled={locked}
              value={c.label}
              maxLength={equipment ? 100 : 200}
              onChange={(e) => change({ choices: q.choices!.map((item, x) => (x === n ? { ...item, label: e.target.value, key: equipment ? equipmentValue(e.target.value) : item.key } : item)) })}
            />
            <IconButton label={`Remove option ${n + 1}`} icon={<X />} size="sm" isDisabled={locked} onPress={() => change({ choices: q.choices!.filter((_, x) => x !== n) })} className={styles.optionRemove} />
          </li>
        ))}
        <li>
          <span className={styles.mark} data-kind={q.type === "MultiChoice" ? "box" : "radio"} aria-hidden="true" />
          <button
            type="button"
            className={styles.addOption}
            disabled={locked}
            onClick={() => {
              const next = (q.choices?.length ?? 0) + 1;
              change({ choices: [...(q.choices ?? []), { key: equipment ? `Equipment_${next}` : newKey(), label: equipment ? `Equipment ${next}` : "" }] });
            }}
          >
            Add option
          </button>
        </li>
      </ul>
    );
  }
  return null;
}

/** A question as the client sees it; the selected one also shows its settings underneath. */
function QuestionBlock({
  question: q,
  index,
  count,
  purpose,
  locked,
  selected,
  select,
  change,
  move,
  duplicate,
  remove,
}: {
  question: Question;
  index: number;
  count: number;
  purpose: Purpose;
  locked: boolean;
  selected: boolean;
  select: () => void;
  change: (value: Partial<Question>) => void;
  move: (by: -1 | 1) => void;
  duplicate: () => void;
  remove: () => void;
}) {
  return (
    <div className={styles.block} data-selected={selected || undefined} >
      <div className={styles.blockHead}>
        <DropdownMenuTrigger><IconButton label={`Question ${index + 1} actions`} icon={<MoreHorizontal />} isDisabled={locked} />
          <DropdownMenu onAction={(key) => { if (key === "edit") select(); if (key === "duplicate") duplicate(); if (key === "delete") remove(); if (key === "up") move(-1); if (key === "down") move(1); }}>
            <DropdownMenuItem id="edit">Edit question</DropdownMenuItem>
            <DropdownMenuItem id="duplicate">Duplicate question</DropdownMenuItem>
            <DropdownMenuItem id="up" isDisabled={index === 0}>Move up</DropdownMenuItem>
            <DropdownMenuItem id="down" isDisabled={index === count - 1}>Move down</DropdownMenuItem>
            <DropdownMenuItem id="delete">Delete question</DropdownMenuItem>
          </DropdownMenu>
        </DropdownMenuTrigger>
        <input className={`${styles.inlineInput} ${styles.questionInput}`} aria-label={`Question ${index + 1}`} placeholder="Type your question" required disabled={locked} value={q.label} onChange={(e) => change({ label: e.target.value })} />
        {q.required ? (
          <span className={styles.required} aria-label="Required">
            *
          </span>
        ) : null}
      </div>
      <input className={`${styles.inlineInput} ${styles.helpInput}`} aria-label={`Help text for question ${index + 1}`} placeholder="Add help text (optional)" disabled={locked} value={q.helpText ?? ""} onChange={(e) => change({ helpText: e.target.value })} />
      <AnswerShape q={q} locked={locked} change={change} />

      {selected ? (
        <div className={styles.settings}>
          <div className={styles.settingsRow}>
            <Select label="Answer type" size="sm" isDisabled={locked} selectedKey={q.type} onSelectionChange={(key) => change(questionType(key as Question["type"]))}>
              {TYPES.map(([id, label]) => (
                <Option key={id} id={id}>
                  {label}
                </Option>
              ))}
            </Select>
            {purpose === "Application" ? (
              <Select label="Profile field" size="sm" isDisabled={locked} selectedKey={q.systemField ?? "none"} onSelectionChange={(key) => change(profileQuestion((key === "none" ? null : key) as Question["systemField"]))}>
                <Option id="none">Custom question</Option>
                {systemFields.map((f) => (
                  <Option key={f} id={f}>
                    {f.replace(/([a-z])([A-Z])/g, "$1 $2")}
                  </Option>
                ))}
              </Select>
            ) : null}
          </div>
          {["Number", "Scale"].includes(q.type) ? (
            <div className={styles.settingsRow}>
              {(["min", "max"] as const).map((bound) => (
                <NumberInput key={bound} size="sm" label={bound === "min" ? "Minimum" : "Maximum"} placeholder="None" isDisabled={locked} value={q[bound] == null ? NaN : Number(q[bound])} onChange={(v) => change({ [bound]: Number.isFinite(v) ? v : null })} />
              ))}
              <TextField size="sm" label="Unit" placeholder="e.g. kg" isDisabled={locked} value={q.unit ?? ""} onChange={(unit) => change({ unit })} />
            </div>
          ) : null}
          {q.type === "Scale" ? (
            <div className={styles.settingsRow}>
              <TextField size="sm" label="Minimum label" placeholder="e.g. Very low" value={q.minLabel ?? ""} isDisabled={locked} onChange={(minLabel) => change({ minLabel })} />
              <TextField size="sm" label="Maximum label" placeholder="e.g. Very high" value={q.maxLabel ?? ""} isDisabled={locked} onChange={(maxLabel) => change({ maxLabel })} />
            </div>
          ) : null}
          {["ShortText", "LongText"].includes(q.type) ? (
            <div className={styles.settingsRow}>
              <NumberInput size="sm" label="Maximum characters" placeholder="No limit" minValue={1} maxValue={10000} step={1} isDisabled={locked} value={q.maxLength == null ? NaN : Number(q.maxLength)} onChange={(v) => change({ maxLength: Number.isFinite(v) ? v : null })} />
            </div>
          ) : null}
          <div className={styles.settingsFoot}>
            <Switch isSelected={q.required} isDisabled={locked} onChange={(required) => change({ required })}>
              Required
            </Switch>

          </div>
        </div>
      ) : null}
    </div>
  );
}

function Editor({ initial, purpose: initialPurpose, onDirtyChange }: { initial?: Template; purpose: Purpose; onDirtyChange?: (dirty: boolean) => void }) {
  const navigate = useNavigate();
  const [current, setCurrent] = useState(initial);
  const [purpose, setPurpose] = useState<Purpose>(initial?.purpose ?? initialPurpose);
  const [name, setName] = useState(initial?.name ?? "");
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const operation = useRef("save");
  const [description, setDescription] = useState(initial?.description ?? "");
  useLayoutEffect(() => { const field = descriptionRef.current; if (field) { field.style.height = "auto"; field.style.height = `${field.scrollHeight + field.offsetHeight - field.clientHeight}px`; } }, [description]);
  const [draft, setDraft] = useState<Definition>(initial?.draft ?? { sections: [] });
  const [selected, setSelected] = useState<string | null>(draft.sections[0]?.questions[0]?.key ?? null);
  const [mode, setMode] = useState("edit");
  const [device, setDevice] = useState("desktop");
  const [answers, setAnswers] = useState<Answers>({});
  const [dirty, setDirtyState] = useState(false);
  const setDirty = (value: boolean) => {
    setDirtyState(value);
    onDirtyChange?.(value);
  };
  const [duplicateKey] = useState(() => crypto.randomUUID());
  const duplicate = useCoachingMutation<Template>((value) => { toast({ tone: "success", title: "Form duplicated" }); navigate(`/app/forms/${value.id}`); });
  useUnsavedWorkGuard(useCallback(() => dirty, [dirty]));
  const mutation = useCoachingMutation<Template>((value) => {
    toast({ tone: "success", title: operation.current === "publish" ? "Form published" : operation.current === "unpublish" ? "Form unpublished" : operation.current === "restore" ? "Form restored" : operation.current === "archive" ? "Form archived" : current ? "Form draft saved" : "Form created" });
    flushSync(() => {
      setCurrent(value);
      setDirty(false);
    });
    if (!current) navigate(`/app/forms/${value.id}`, { replace: true });
  });
  const locked = Boolean(mutation.isPending || current?.archived);
  const update = (value: Definition) => {
    setDraft(value);
    setDirty(true);
  };
  const editSection = (i: number, value: Partial<Section>) => update({ sections: draft.sections.map((s, n) => (n === i ? { ...s, ...value } : s)) });
  const setQuestions = (i: number, questions: Question[]) => editSection(i, { questions: questions.map((q, order) => ({ ...q, order })) });
  const addQuestion = (i: number, type: Question["type"]) => {
    const question = blankQuestion(type, draft.sections[i]!.questions.length);
    setQuestions(i, [...draft.sections[i]!.questions, question]);
    setSelected(question.key);
  };
  const write = (action: string) => { operation.current = action; if (current) mutation.mutate({ method: "POST", path: `/api/v1/forms/${current.id}/${action}`, ifMatch: current.version }); };
  const status = current?.archived ? "Archived" : current?.currentPublishedVersionId ? "Published" : current ? "Draft" : "New";
  const count = draft.sections.reduce((sum, s) => sum + s.questions.length, 0);

  return (
    <>
      <PageHeader
        title={current ? name || "Edit form" : "New form"}
        description={purpose === "CheckIn" ? "A check-in your clients complete regularly." : "The questions you ask before accepting a new client."}
        meta={<Badge tone={status === "Published" ? "success" : status === "Archived" ? "warning" : "neutral"}>{status}</Badge>}
        actions={
          <>
            {current ? (
              <>
                <Button loading={mutation.isPending && /\/(archive|restore)$/.test(mutation.variables?.path ?? "")} isDisabled={mutation.isPending || dirty} onPress={() => write(current.archived ? "restore" : "archive")}>
                  {current.archived ? "Restore" : "Archive"}
                </Button>
                <Button
                  loading={duplicate.isPending}
                  isDisabled={dirty || mutation.isPending}
                  onPress={() => duplicate.mutate({ method: "POST", path: `/api/v1/forms/${current.id}/duplicate`, ifMatch: current.version, json: { idempotencyKey: duplicateKey } })}
                >
                  Duplicate
                </Button>
              </>
            ) : null}
            <Button type="submit" form="form-builder" variant={current && !dirty ? "secondary" : "primary"} isDisabled={current?.archived || mutation.isPending} loading={mutation.isPending && !/\/(publish|unpublish|archive|restore)$/.test(mutation.variables?.path ?? "")}>
              {current ? "Save draft" : "Create form"}
            </Button>
            {current?.currentPublishedVersionId && !current.archived ? (
              <Button variant="danger" loading={mutation.isPending && mutation.variables?.path.endsWith("/unpublish")} isDisabled={locked || mutation.isPending} onPress={() => write("unpublish")}>
                Unpublish
              </Button>
            ) : null}
            {current ? (
              <Button variant="primary" loading={mutation.isPending && mutation.variables?.path.endsWith("/publish")} isDisabled={locked || dirty} onPress={() => write("publish")}>
                {current.currentPublishedVersionId ? "Publish changes" : "Publish form"}
              </Button>
            ) : null}
          </>
        }
      />
      <DraftNavigationGuard dirty={dirty} />
      <div className={styles.notices}>
        <MutationError error={mutation.error} />
        <MutationError error={duplicate.error} />
        {current?.currentPublishedVersionId ? <Alert title="Published answers stay unchanged">Editing this draft affects future uses only after you publish a new version.</Alert> : null}
        {current?.archived ? <Alert tone="warning" title="This form is archived" actions={<Button onPress={() => write("restore")}>Restore form</Button>} /> : null}
      </div>

      {/* The workspace: the form exactly as the client sees it, edited in place. */}
      <div className={styles.workspace}>
        <div className={styles.frameBar}>
          <span className={styles.dots} aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span className={styles.frameTitle}>
            {mode === "edit" ? "Editing" : "Trying it out"}
            <small>
              Client view · {count} {count === 1 ? "question" : "questions"}
              {dirty && current ? " · unsaved changes" : ""}
            </small>
          </span>
          {!current ? (
            <SegmentedControl aria-label="Used for" size="sm" selectedKeys={[purpose]} onSelectionChange={(keys) => setPurpose([...keys][0] as Purpose)}>
              <Segment id="Application">Applications</Segment>
              <Segment id="CheckIn">Check-ins</Segment>
            </SegmentedControl>
          ) : null}
          <SegmentedControl aria-label="Mode" size="sm" selectedKeys={[mode]} onSelectionChange={(keys) => setMode(String([...keys][0] ?? "edit"))}>
            <Segment id="edit">
              <PenLine aria-hidden="true" /> Edit
            </Segment>
            <Segment id="try">
              <Play aria-hidden="true" /> Try it
            </Segment>
          </SegmentedControl>
          <SegmentedControl aria-label="Preview width" size="sm" selectedKeys={[device]} onSelectionChange={(keys) => setDevice(String([...keys][0] ?? "desktop"))}>
            <Segment id="desktop" aria-label="Desktop">
              <Monitor aria-hidden="true" />
            </Segment>
            <Segment id="phone" aria-label="Phone">
              <Smartphone aria-hidden="true" />
            </Segment>
          </SegmentedControl>
        </div>

        <div className={styles.canvas}>
          <form
            id="form-builder"
            className={styles.screen}
            data-device={device}
            hidden={mode !== "edit"}
            onSubmit={(e) => {
              e.preventDefault();
              if (!count) { toast({ tone: "danger", title: "Add at least one question before saving" }); return; }
              operation.current = "save";
              mutation.mutate({ method: current ? "PATCH" : "POST", path: `/api/v1/forms${current ? `/${current.id}` : ""}`, ifMatch: current?.version, json: { purpose, name, description, draft } });
            }}
          >
            <input className={`${styles.inlineInput} ${styles.nameInput}`} aria-label="Form name" placeholder={purpose === "CheckIn" ? "Weekly check-in" : "Online coaching intake"} value={name} maxLength={200} required disabled={locked} autoFocus={!current} onChange={(e) => { setName(e.target.value); setDirty(true); }} />
            <textarea ref={descriptionRef} className={`${styles.inlineInput} ${styles.descriptionInput}`} aria-label="Description" placeholder="Add a description (optional)" rows={1} value={description} maxLength={4000} disabled={locked} onChange={(e) => { setDescription(e.target.value); setDirty(true); }} />

            {draft.sections.map((s, i) => (
              <section className={styles.section} key={s.key} aria-label={`Section ${i + 1}`}>
                <div className={styles.sectionHead}>
                  <input className={`${styles.inlineInput} ${styles.sectionInput}`} aria-label={`Section ${i + 1} title`} placeholder="Section title" required disabled={locked} value={s.title} onChange={(e) => editSection(i, { title: e.target.value })} />
                  <IconButton label="Remove section" icon={<Trash2 />} size="sm" isDisabled={locked || draft.sections.length < 2} onPress={() => update({ sections: draft.sections.filter((_, n) => n !== i) })} className={styles.sectionRemove} />
                </div>
                <input className={`${styles.inlineInput} ${styles.helpInput}`} aria-label={`Section ${i + 1} description`} placeholder="Add a sentence shown above the questions (optional)" disabled={locked} value={s.description ?? ""} onChange={(e) => editSection(i, { description: e.target.value })} />
                {s.questions.map((q, j) => (
                  <QuestionBlock
                    key={q.key}
                    question={q}
                    index={j}
                    count={s.questions.length}
                    purpose={purpose}
                    locked={locked}
                    selected={selected === q.key}
                    select={() => setSelected(q.key)}
                    change={(value) => setQuestions(i, s.questions.map((item, x) => (x === j ? { ...item, ...value } : item)))}
                    move={(by) => {
                      const questions = [...s.questions];
                      [questions[j], questions[j + by]] = [questions[j + by]!, questions[j]!];
                      setQuestions(i, questions);
                    }}
                    duplicate={() => {
                      const copy = { ...q, key: newKey(), choices: q.choices?.map((c) => ({ ...c, key: q.systemField === "AvailableEquipment" ? c.key : newKey() })) ?? null };
                      setQuestions(i, [...s.questions.slice(0, j + 1), copy, ...s.questions.slice(j + 1)]);
                      setSelected(copy.key);
                    }}
                    remove={() => setQuestions(i, s.questions.filter((_, x) => x !== j))}
                  />
                ))}
                {/* Add as many questions as needed, each starting as the chosen answer type. */}
                <div className={styles.add} role="group" aria-label={`Add a question to section ${i + 1}`}>
                  <span className={styles.addLabel}>
                    <Plus aria-hidden="true" /> Add question
                  </span>
                  {TYPES.map(([type, label]) => (
                    <button key={type} type="button" className={styles.addType} disabled={locked} onClick={() => addQuestion(i, type)}>
                      {label}
                    </button>
                  ))}
                </div>
              </section>
            ))}
            <Button iconStart={<Plus />} variant="ghost" isDisabled={locked} onPress={() => update({ sections: [...draft.sections, blankSection(draft.sections.length)] })} className={styles.addSection}>
              Add section
            </Button>
          </form>

          {mode === "try" ? (
            <div className={styles.screen} data-device={device}>
              <header className={styles.tryHead}>
                <h2>{name || "Untitled form"}</h2>
                {description ? <p>{description}</p> : null}
              </header>
              <FormAnswerFields definition={draft} answers={answers} onChange={setAnswers} />
              <div className={styles.tryFoot}>
                <Button variant="primary" isDisabled>
                  Submit
                </Button>
                <Button variant="ghost" onPress={() => setAnswers({})}>
                  Clear answers
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}

export default function FormDetail() {
  const { formId } = useParams();
  const [params] = useSearchParams();
  const detail = useCoachingQuery<Template>(`/api/v1/forms/${formId}`, undefined, Boolean(formId));
  if (!formId) return <Editor purpose={params.get("purpose") === "CheckIn" ? "CheckIn" : "Application"} />;
  if (detail.isPending) return <Loading />;
  if (detail.isError) return <Failure error={detail.error} retry={() => void detail.refetch()} />;
  return <EditableResource value={detail.data}>{(value, onDirtyChange) => <Editor key={`${value.id}:${value.version}`} initial={value} purpose={value.purpose} onDirtyChange={onDirtyChange} />}</EditableResource>;
}
