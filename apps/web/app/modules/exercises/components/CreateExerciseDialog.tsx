import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import type { CreateExerciseRequest } from "@metrivum/api-client-web";
import { Alert, Button, Dialog, TextArea, TextField, toast, DialogFooter } from "@metrivum/ui-web";
import { ApiError } from "~/shared/http/errors";
import { useLocale } from "~/shared/i18n/LocaleContext";
import { useT } from "~/shared/i18n/AppLocale";
import { errorText } from "~/shared/lib/errorText";
import { useAccountKey, useApi } from "~/shared/session/AccountScope";
import { createExercise, createTag } from "../api";
import { exerciseKeys, useDictionaries, useTags } from "../queries";
import { MultiPick } from "./MultiPick";
import styles from "./CreateExerciseDialog.module.css";

function safeHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

export function CreateExerciseDialog({ isOpen, onOpenChange }: { isOpen: boolean; onOpenChange: (open: boolean) => void }) {
  const m = useT();
  const t = m.exercises.create;
  const locale = useLocale();
  const api = useApi();
  const a = useAccountKey();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const dictionaries = useDictionaries();
  const tags = useTags();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");
  const [url, setUrl] = useState("");
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [primary, setPrimary] = useState<string[]>([]);
  const [secondary, setSecondary] = useState<string[]>([]);
  const [patterns, setPatterns] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState(false);

  const label = (entry: { labelEn: string; labelPl: string }) => (locale === "pl" ? entry.labelPl : entry.labelEn);
  const byLabel = (a: { label: string }, b: { label: string }) => a.label.localeCompare(b.label);
  const activeMuscles = (dictionaries.data?.muscles ?? []).filter((d) => d.isActive).map((d) => ({ id: d.key, label: label(d) })).sort(byLabel);
  const activePatterns = (dictionaries.data?.movementPatterns ?? []).filter((d) => d.isActive).map((d) => ({ id: d.key, label: label(d) })).sort(byLabel);

  const mutation = useMutation({
    mutationFn: (body: CreateExerciseRequest) => createExercise(api, body),
    onSuccess: (exercise) => {
      void queryClient.invalidateQueries({ queryKey: exerciseKeys.all(a) });
      toast({ tone: "success", title: t.created });
      onOpenChange(false);
      navigate(`/app/exercises/${exercise.id}`);
    },
  });

  const tagMutation = useMutation({
    mutationFn: (tagName: string) => createTag(api, tagName),
    onSuccess: (tag) => {
      void queryClient.invalidateQueries({ queryKey: [a, "exercises", "tags"] });
      setTagIds((ids) => [...ids, tag.id]);
      toast({ tone: "success", title: t.tagCreated(tag.name) });
    },
  });

  const duplicate = mutation.error instanceof ApiError && mutation.error.code === "EXERCISE_NAME_EXISTS";
  const urlInvalid = url.trim() !== "" && !safeHttpsUrl(url.trim());

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitted(true);
    if (!name.trim() || urlInvalid) return;
    mutation.mutate({
      name: name.trim(),
      description: description.trim(),
      instructions: instructions.trim(),
      demonstrationUrl: url.trim() || null,
      tagIds,
      primaryMuscleKeys: primary,
      secondaryMuscleKeys: secondary.filter((key) => !primary.includes(key)),
      movementPatternKeys: patterns,
    });
  }

  return (
    <Dialog isOpen={isOpen} onOpenChange={onOpenChange} title={t.title} description={t.body} size="lg" closeLabel={m.common.close}>
      <form id="create-exercise" className={styles.form} onSubmit={onSubmit} noValidate>
        {mutation.error && !duplicate ? <Alert tone="danger" title={errorText(m, mutation.error)} live="assertive" /> : null}
        <TextField placeholder={m.common.ph.exerciseName}
          label={t.name}
          value={name}
          onChange={setName}
          isRequired
          autoFocus
          isInvalid={(submitted && !name.trim()) || duplicate}
          errorMessage={duplicate ? m.errors.byCode.EXERCISE_NAME_EXISTS : m.auth.errors.required}
        />
        <TextArea placeholder={m.common.ph.description} label={t.description} value={description} onChange={setDescription} rows={3} />
        <TextArea placeholder={m.common.ph.instructions} label={t.instructions} value={instructions} onChange={setInstructions} rows={4} />
        <TextField placeholder={m.common.ph.url}
          label={t.demonstrationUrl}
          type="url"
          value={url}
          onChange={setUrl}
          description={t.demonstrationHint}
          isInvalid={urlInvalid}
          errorMessage={t.demonstrationHint}
        />
        <div className={styles.grid}>
          <MultiPick
            label={t.tags}
            options={(tags.data ?? []).map((tag) => ({ id: tag.id, label: tag.name }))}
            selected={tagIds}
            onChange={setTagIds}
            onCreate={(value) => tagMutation.mutate(value)}
            createLabel={t.newTag}
          />
          <MultiPick label={t.patterns} options={activePatterns} selected={patterns} onChange={setPatterns} />
          <MultiPick label={t.primaryMuscles} options={activeMuscles} selected={primary} onChange={setPrimary} />
          <MultiPick
            label={t.secondaryMuscles}
            options={activeMuscles.filter((muscle) => !primary.includes(muscle.id))}
            selected={secondary}
            onChange={setSecondary}
          />
        </div>
      </form>
      <DialogFooter>
        <Button variant="secondary" onPress={() => onOpenChange(false)}>
          {m.common.cancel}
        </Button>
        <Button variant="primary" type="submit" form="create-exercise" loading={mutation.isPending}>
          {t.submit}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
