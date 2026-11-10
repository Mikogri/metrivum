import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, FileUp } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import type {
  DocumentKind,
  ExerciseListItemDto,
  ImportPreview,
  ImportRowPreview,
} from "@metrivum/api-client-web";
import {
  Alert,
  Badge,
  Button,
  Dialog,
  FileCard,
  Option,
  Pagination,
  Radio,
  RadioGroup,
  Select,
  TextField,
  toast,
  DialogFooter,
} from "@metrivum/ui-web";
import { ExercisePicker, useExerciseNames } from "~/modules/exercises";
import { useFeatureAccess } from "~/shared/access";
import { ApiError } from "~/shared/http/errors";
import { newIdempotencyKey } from "~/shared/http/transport";
import { formatBytes, formatRelative } from "~/shared/i18n/format";
import { useLocale } from "~/shared/i18n/LocaleContext";
import { useT } from "~/shared/i18n/AppLocale";
import { errorText } from "~/shared/lib/errorText";
import { useAccountKey, useApi } from "~/shared/session/AccountScope";
import {
  commitImport,
  getImport,
  mapImport,
  startImport,
  validateImport,
} from "../api";
import { FolderField } from "../library/FolderField";
import { trainingKeys } from "../queries";
import styles from "./ImportWizard.module.css";

const MAX_BYTES = 2 * 1024 * 1024;
const PAGE_SIZE = 100;
type Step = "file" | "map" | "validate" | "commit";

/**
 * CSV import as a temporary server session: file → preview and exercise matching → validation →
 * commit. Nothing is created before commit, and no exercises are ever created by the importer.
 */
export function ImportWizard({
  isOpen,
  onOpenChange,
  folderId,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  folderId: string | null;
}) {
  const m = useT();
  const t = m.training.import;
  const locale = useLocale();
  const api = useApi();
  const a = useAccountKey();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const templates = useFeatureAccess("training.templates.manage");
  const fileInput = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>("file");
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [delimiter, setDelimiter] = useState<"comma" | "semicolon" | "tab">(
    "comma",
  );
  const [session, setSession] = useState<{
    id: string;
    version: number;
    expiresAt: string;
    rowCount: number;
  } | null>(null);
  const [page, setPage] = useState(1);
  const [manual, setManual] = useState<Record<number, string>>({});
  const [pickerRow, setPickerRow] = useState<ImportRowPreview | null>(null);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<DocumentKind>("Program");
  const [folder, setFolder] = useState<string | null>(folderId);
  const commitKey = useRef<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setStep("file");
    setFile(null);
    setFileError(null);
    setSession(null);
    setManual({});
    setPage(1);
    setFolder(folderId);
  }, [isOpen, folderId]);

  const preview = useQuery({
    queryKey: [a, "training", "import", session?.id, page],
    queryFn: ({ signal }) => getImport(api, session!.id, page, signal),
    enabled: Boolean(session) && step !== "file",
    staleTime: 30_000,
  });

  const start = useMutation({
    mutationFn: async () => {
      const text = await file!.text();
      return startImport(api, text, delimiter);
    },
    onSuccess: ({ data, version }) => {
      setSession({
        id: data.id,
        version,
        expiresAt: data.expiresAt,
        rowCount: data.rowCount,
      });
      queryClient.setQueryData([a, "training", "import", data.id, 1], {
        data,
        version,
      });
      setName(file?.name.replace(/\.csv$/i, "") ?? "");
      setStep("map");
    },
  });

  const rows = useMemo(() => preview.data?.data.rows ?? [], [preview.data]);
  const names = useExerciseNames(
    useMemo(
      () =>
        [
          ...rows.map((r) => r.matchedExerciseId),
          ...Object.values(manual),
        ].filter(Boolean) as string[],
      [rows, manual],
    ),
  );

  const saveMapping = useMutation({
    mutationFn: async () => {
      // The mapping endpoint replaces the whole mapping, so every exercise row must be included.
      const pages = Math.max(1, Math.ceil(session!.rowCount / PAGE_SIZE));
      const all: ImportRowPreview[] = [];
      for (let p = 1; p <= pages; p++) {
        const cached = queryClient.getQueryData<{
          data: ImportPreview;
          version: number;
        }>([a, "training", "import", session!.id, p]);
        const result = cached ?? (await getImport(api, session!.id, p));
        all.push(...result.data.rows);
      }
      const mapping: Record<string, string> = {};
      for (const row of all) {
        if (row.rowKind !== "exercise") continue;
        const chosen = manual[row.index] ?? row.matchedExerciseId;
        if (chosen) mapping[String(row.index)] = chosen;
      }
      return mapImport(api, session!.id, mapping, session!.version);
    },
    onSuccess: ({ data, version }) => {
      setSession((s) => (s ? { ...s, version } : s));
      queryClient.setQueryData([a, "training", "import", data.id, page], {
        data,
        version,
      });
      void queryClient.invalidateQueries({
        queryKey: [a, "training", "import", data.id],
      });
      toast({ tone: "success", title: t.mappingSaved });
      setStep("validate");
      validate.mutate();
    },
  });

  const validate = useMutation({
    mutationFn: () => validateImport(api, session!.id),
  });

  const commit = useMutation({
    mutationFn: () =>
      commitImport(
        api,
        session!.id,
        { name: name.trim(), kind, folderId: folder },
        session!.version,
        commitKey.current ?? (commitKey.current = newIdempotencyKey()),
      ),
    onSuccess: ({ data }) => {
      commitKey.current = null;
      void queryClient.invalidateQueries({ queryKey: trainingKeys.plans(a) });
      toast({ tone: "success", title: t.committed });
      onOpenChange(false);
      navigate(`/app/programs/${data.id}`);
    },
  });

  const expired = [
    start.error,
    preview.error,
    saveMapping.error,
    validate.error,
    commit.error,
  ].some(
    (error) =>
      error instanceof ApiError &&
      (error.status === 404 || error.status === 410),
  );
  const unmatchedOnPage = rows.filter(
    (row) =>
      row.rowKind === "exercise" &&
      !(manual[row.index] ?? row.matchedExerciseId),
  ).length;
  const steps: Step[] = ["file", "map", "validate", "commit"];

  function chooseFile(next: File | undefined) {
    setFileError(null);
    if (!next) return;
    if (!/\.csv$/i.test(next.name) && next.type !== "text/csv") {
      setFileError(t.notCsv);
      return;
    }
    if (next.size > MAX_BYTES) {
      setFileError(t.tooLarge);
      return;
    }
    setFile(next);
  }

  const validDoc = validate.data?.document;
  const workoutCount = validDoc
    ? validDoc.blocks
        .flatMap((b) => b.cycles)
        .flatMap((c) => c.days)
        .flatMap((d) => d.workouts).length
    : 0;

  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title={t.title}
      size="xl"
      closeLabel={m.common.close}
    >
      <ol className={styles.steps} aria-label={t.title}>
        {steps.map((key, index) => {
          const current = steps.indexOf(step);
          return (
            <li
              key={key}
              data-state={
                index < current
                  ? "done"
                  : index === current
                    ? "current"
                    : "todo"
              }
              aria-current={index === current ? "step" : undefined}
            >
              <span className={styles.stepDot} aria-hidden="true">
                {index < current ? <Check /> : index + 1}
              </span>
              {t.steps[key]}
            </li>
          );
        })}
      </ol>

      {expired ? (
        <Alert
          tone="warning"
          title={t.expired}
          actions={
            <Button size="sm" onPress={() => setStep("file")}>
              {t.startOver}
            </Button>
          }
        />
      ) : null}

      {step === "file" ? (
        <div className={styles.body}>
          <p className={styles.muted}>{t.fileHint}</p>
          <input
            ref={fileInput}
            type="file"
            accept=".csv,text/csv"
            className="tf-visually-hidden"
            onChange={(event) => chooseFile(event.target.files?.[0])}
            tabIndex={-1}
            aria-hidden="true"
          />
          <div
            className={styles.drop}
            data-has-file={file ? true : undefined}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              chooseFile(event.dataTransfer.files?.[0]);
            }}
          >
            {file ? (
              <FileCard
                name={file.name}
                kind="CSV"
                meta={formatBytes(locale, file.size)}
              />
            ) : (
              <FileUp aria-hidden="true" className={styles.dropIcon} />
            )}
            <Button onPress={() => fileInput.current?.click()}>
              {t.chooseFile}
            </Button>
          </div>
          {fileError ? <Alert tone="danger" title={fileError} /> : null}
          <Select
            label={t.delimiter}
            selectedKey={delimiter}
            onSelectionChange={(key) => setDelimiter(key as typeof delimiter)}
            className={styles.narrow}
          >
            {(["comma", "semicolon", "tab"] as const).map((key) => (
              <Option key={key} id={key}>
                {m.training.export.delimiters[key]}
              </Option>
            ))}
          </Select>
          {start.error ? (
            <Alert tone="danger" title={errorText(m, start.error)}>
              {start.error instanceof ApiError
                ? start.error.problem?.detail
                : null}
            </Alert>
          ) : null}
          <DialogFooter>
            <Button variant="secondary" onPress={() => onOpenChange(false)}>
              {m.common.cancel}
            </Button>
            <Button
              variant="primary"
              isDisabled={!file}
              loading={start.isPending}
              onPress={() => start.mutate()}
            >
              {t.upload}
            </Button>
          </DialogFooter>
        </div>
      ) : null}

      {step === "map" && session ? (
        <div className={styles.body}>
          <div className={styles.summary}>
            <Badge>{t.rows(session.rowCount)}</Badge>
            <span className={styles.muted}>
              {t.expires(formatRelative(locale, session.expiresAt))}
            </span>
            {unmatchedOnPage ? (
              <Badge tone="warning">{t.unmatchedCount(unmatchedOnPage)}</Badge>
            ) : null}
          </div>
          <Alert tone="info" title={t.noNewExercises} />
          <div className={styles.tableWrap} aria-busy={preview.isFetching}>
            <table className={styles.table}>
              <thead>
                <tr>
                  {(
                    [
                      "index",
                      "block",
                      "cycle",
                      "day",
                      "workout",
                      "exercise",
                      "match",
                    ] as const
                  ).map((key) => (
                    <th key={key} scope="col">
                      {t.columns[key]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const chosen = manual[row.index] ?? row.matchedExerciseId;
                  const isExercise = row.rowKind === "exercise";
                  return (
                    <tr key={row.index} data-kind={row.rowKind}>
                      <td>{row.index + 1}</td>
                      <td>{row.block}</td>
                      <td>{row.cycle}</td>
                      <td>{row.day || ""}</td>
                      <td>{row.workout}</td>
                      <td>{row.exercise}</td>
                      <td>
                        {isExercise ? (
                          <span className={styles.match}>
                            {chosen ? (
                              <Badge tone="success" size="sm" dot>
                                {names.get(chosen)?.name ?? t.matched}
                              </Badge>
                            ) : (
                              <Badge tone="warning" size="sm" dot>
                                {t.unmatched}
                              </Badge>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              onPress={() => setPickerRow(row)}
                            >
                              {t.chooseExercise}
                            </Button>
                          </span>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {session.rowCount > PAGE_SIZE ? (
            <p className={styles.muted}>{t.pageNote}</p>
          ) : null}
          <Pagination
            page={page}
            pageCount={Math.max(1, Math.ceil(session.rowCount / PAGE_SIZE))}
            onPageChange={setPage}
            labels={{
              previous: m.common.previous,
              next: m.common.next,
              status: m.common.pageStatus,
              navigation: m.common.pagination,
            }}
          />
          {saveMapping.error ? (
            <Alert tone="danger" title={errorText(m, saveMapping.error)} />
          ) : null}
          <DialogFooter>
            <Button variant="secondary" onPress={() => setStep("file")}>
              {t.startOver}
            </Button>
            <Button
              variant="primary"
              loading={saveMapping.isPending}
              onPress={() => saveMapping.mutate()}
            >
              {t.saveMapping}
            </Button>
          </DialogFooter>
        </div>
      ) : null}

      {step === "validate" ? (
        <div className={styles.body}>
          {validate.isPending ? (
            <p className={styles.muted}>{m.common.loading}</p>
          ) : null}
          {validate.error ? (
            <Alert
              tone="danger"
              title={errorText(m, validate.error)}
              live="assertive"
            >
              {validate.error instanceof ApiError
                ? validate.error.problem?.detail
                : null}
            </Alert>
          ) : null}
          {validate.data?.valid ? (
            <Alert tone="success" title={t.valid}>
              {t.validSummary(validDoc?.blocks.length ?? 0, workoutCount)}
            </Alert>
          ) : null}
          <DialogFooter>
            <Button variant="secondary" onPress={() => setStep("map")}>
              {m.common.back}
            </Button>
            <Button
              variant="primary"
              isDisabled={!validate.data?.valid}
              onPress={() => {
                commitKey.current = newIdempotencyKey();
                setStep("commit");
              }}
            >
              {m.common.next}
            </Button>
          </DialogFooter>
        </div>
      ) : null}

      {step === "commit" ? (
        <form
          className={styles.body}
          onSubmit={(event) => {
            event.preventDefault();
            if (name.trim()) commit.mutate();
          }}
        >
          <TextField
            placeholder={m.common.ph.programName}
            label={t.commitName}
            value={name}
            onChange={setName}
            isRequired
            autoFocus
            maxLength={200}
          />
          <RadioGroup
            label={t.commitKind}
            orientation="horizontal"
            value={kind}
            onChange={(value) => setKind(value as DocumentKind)}
          >
            <Radio value="Program">
              {m.training.library.copyDialog.program}
            </Radio>
            <Radio value="Template" isDisabled={!templates.allowed}>
              {m.training.library.copyDialog.template}
            </Radio>
          </RadioGroup>
          <FolderField
            label={t.commitFolder}
            value={folder}
            onChange={setFolder}
          />
          {commit.error ? (
            <Alert tone="danger" title={errorText(m, commit.error)} />
          ) : null}
          <DialogFooter>
            <Button variant="secondary" onPress={() => setStep("validate")}>
              {m.common.back}
            </Button>
            <Button type="submit" variant="primary" loading={commit.isPending}>
              {t.commit}
            </Button>
          </DialogFooter>
        </form>
      ) : null}

      <ExercisePicker
        isOpen={pickerRow !== null}
        onOpenChange={(open) => !open && setPickerRow(null)}
        selectedId={
          pickerRow
            ? (manual[pickerRow.index] ??
              pickerRow.matchedExerciseId ??
              undefined)
            : undefined
        }
        title={
          pickerRow ? `${t.chooseExercise}: ${pickerRow.exercise}` : undefined
        }
        onPick={(exercise: ExerciseListItemDto) => {
          if (pickerRow)
            setManual((current) => ({
              ...current,
              [pickerRow.index]: exercise.id,
            }));
        }}
      />
    </Dialog>
  );
}
