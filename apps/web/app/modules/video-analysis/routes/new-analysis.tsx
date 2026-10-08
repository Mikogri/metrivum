import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, FileVideo, RefreshCcw, Upload } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import {
  Alert,
  Breadcrumbs,
  Button,
  Card,
  EmptyState,
  LinkButton,
  Option,
  PageHeader,
  Select,
  Spinner,
  TextArea,
  TextField,
  toast,
} from "@trainflow/ui-web";
import { AccessNotice, RequireFeature, useFeatureAccess, useLimit } from "~/shared/access";
import { ApiError, isAbortError } from "~/shared/http/errors";
import { newIdempotencyKey } from "~/shared/http/transport";
import { formatBytes } from "~/shared/i18n/format";
import { useLocale } from "~/shared/i18n/LocaleContext";
import { useT } from "~/shared/i18n/AppLocale";
import { errorText } from "~/shared/lib/errorText";
import { useAccountKey, useApi } from "~/shared/session/AccountScope";
import { useUnsavedWorkGuard } from "~/shared/session/dirty-guard";
import { createAnalysis, deleteMedia, finalizeUpload, reserveUpload } from "../api";
import { videoKeys } from "../queries";
import { ACCEPTED_TYPES, DEFAULT_MAX_BYTES, uploadToSignedUrl, videoContentType } from "../upload";
import { TrackingPicker, type TrackingSelection } from "../components/TrackingPicker";
import styles from "./new-analysis.module.css";
import { privateMeta } from "~/shared/i18n/site";

export const meta = () => privateMeta("New analysis — TrainFlow");

type Stage = { kind: "idle" } | { kind: "uploading"; ratio: number } | { kind: "verifying" } | { kind: "starting" } | { kind: "analyzerMissing" };

function NewAnalysis() {
  const m = useT();
  const t = m.video.new;
  const locale = useLocale();
  const api = useApi();
  const a = useAccountKey();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const runAccess = useFeatureAccess("video.analysis.run");
  const maxLimit = useLimit("media.maxVideoBytes");
  const maxBytes = maxLimit?.maximum && maxLimit.maximum > 0 ? maxLimit.maximum : DEFAULT_MAX_BYTES;
  const input = useRef<HTMLInputElement>(null);
  const abort = useRef<AbortController | null>(null);
  const idempotency = useRef<{ key: string; payload: string } | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [name, setName] = useState("");
  const [tags, setTags] = useState("");
  const [note, setNote] = useState("");
  const [movement, setMovement] = useState("");
  const [tracking, setTracking] = useState<TrackingSelection | null>(null);
  const [localPreview, setLocalPreview] = useState<{ file: File; url: string } | null>(null);
  useEffect(() => {
    if (!file) { setLocalPreview(null); return; }
    const url = URL.createObjectURL(file);
    setLocalPreview({ file, url });
    return () => URL.revokeObjectURL(url);
  }, [file]);
  const previewUrl = file && localPreview?.file === file ? localPreview.url : null;
  const [stage, setStage] = useState<Stage>({ kind: "idle" });
  // An upload is kept only for the analysis it was made for: if no analysis comes of it, it is deleted.
  const [upload, setUpload] = useState<{ id: string; version: number } | null>(null);
  const unused = useRef<{ id: string; version: number } | null>(null);
  const discard = (media: { id: string; version: number } | null) => {
    if (media) void deleteMedia(api, media.id, media.version).catch(() => undefined);
  };
  useEffect(
    () => () => {
      abort.current?.abort();
      discard(unused.current);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- cleanup when leaving the page only
    [],
  );
  const busy = stage.kind === "uploading" || stage.kind === "verifying" || stage.kind === "starting";
  useUnsavedWorkGuard(() => busy);

  function pick(next: File | undefined) {
    setFileError(null);
    if (!next) return;
    if (!ACCEPTED_TYPES.includes(videoContentType(next))) {
      setFileError(t.wrongType);
      return;
    }
    if (next.size > maxBytes) {
      setFileError(t.tooLarge(formatBytes(locale, maxBytes)));
      return;
    }
    if (busy) return;
    setTracking(null);
    setFile(next);
    discard(upload);
    unused.current = null;
    setUpload(null);
    if (!name) setName(next.name.replace(/\.[^.]+$/, ""));
  }

  const run = useMutation({
    mutationFn: async () => {
      let id = upload?.id ?? null;
      if (!id && file) {
        const controller = new AbortController();
        abort.current = controller;
        setStage({ kind: "uploading", ratio: 0 });
        const ticket = await reserveUpload(api, { name: file.name, contentType: videoContentType(file), size: file.size });
        await uploadToSignedUrl(ticket.uploadUrl, file, videoContentType(file), (ratio) => setStage({ kind: "uploading", ratio }), controller.signal);
        setStage({ kind: "verifying" });
        const media = await finalizeUpload(api, ticket.file.id);
        id = media.id;
        // Remember the upload so a retry doesn't send it again; it is deleted if no analysis is created.
        const kept = { id: media.id, version: media.version };
        unused.current = kept;
        setUpload(kept);
      }
      if (!id || tracking?.points.length !== 2) throw new Error("Video and two tracking points are required");
      setStage({ kind: "starting" });
      const body = {
        name: name.trim(),
        note: note.trim() || null,
        tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean),
        mediaId: id,
        configuration: { movement: movement.trim() || "unspecified", metersPerPixel: null, tracking },
      };
      const payload = JSON.stringify(body);
      if (idempotency.current?.payload !== payload) idempotency.current = { key: newIdempotencyKey(), payload };
      return createAnalysis(api, body, idempotency.current.key);
    },
    onSuccess: (analysis) => {
      idempotency.current = null;
      unused.current = null;
      void queryClient.invalidateQueries({ queryKey: videoKeys.all(a) });
      toast({ tone: "success", title: t.started });
      navigate(`/app/video-analyses/${analysis.id}`);
    },
    onError: (error) => {
      if (error instanceof ApiError && error.code === "ANALYZER_NOT_CONFIGURED") {
        // Nothing will analyze this video, so it is not kept.
        discard(unused.current);
        unused.current = null;
        setUpload(null);
        setStage({ kind: "analyzerMissing" });
        return;
      }
      setStage({ kind: "idle" });
    },
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy || !name.trim() || !file || tracking?.points.length !== 2) return;
    run.mutate();
  }

  if (stage.kind === "analyzerMissing") {
    return (
      <>
        <PageHeader title={t.title} />
        <EmptyState
          icon={<CheckCircle2 />}
          title={t.analyzerMissingTitle}
          description={t.analyzerMissingBody}
          actions={
            <LinkButton href="/app/video-analyses" variant="primary">
              {t.goToLibrary}
            </LinkButton>
          }
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        context={<Breadcrumbs items={[{ id: "list", label: m.video.list.title, href: "/app/video-analyses" }, { id: "new", label: t.title }]} />}
        title={t.title}
        description={t.body}
      />
      <form className={styles.layout} onSubmit={onSubmit} noValidate>
        <Card
          as="section"
          padding="lg"
          aria-labelledby="video-title"
          className={styles.videoCard}
          data-dragging={dragging || undefined}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            pick(event.dataTransfer.files?.[0]);
          }}
        >
          <h2 id="video-title" className="tf-visually-hidden">
            {t.step.file}
          </h2>
          <input ref={input} type="file" accept="video/mp4,video/webm,video/quicktime,.mov" className="tf-visually-hidden" tabIndex={-1} aria-hidden="true" onChange={(event) => pick(event.target.files?.[0])} />
          {file && previewUrl ? (
            <>
              <div className={styles.pickerArea}>
                <TrackingPicker key={previewUrl} src={previewUrl} value={tracking} onChange={setTracking} disabled={busy} />
              </div>
              <div className={styles.fileBar}>
                <span className={styles.fileName}>
                  <FileVideo aria-hidden="true" />
                  {file.name}
                  <span className={styles.hint}>{formatBytes(locale, file.size)}</span>
                </span>
                <Button size="sm" variant="ghost" iconStart={<RefreshCcw />} onPress={() => input.current?.click()} isDisabled={busy}>
                  {t.changeVideo}
                </Button>
              </div>
            </>
          ) : (
            <div className={styles.empty}>
              <span className={styles.emptyIcon} aria-hidden="true">
                <FileVideo />
              </span>
              <p className={styles.emptyTitle}>{t.dropTitle}</p>
              <Button variant="primary" onPress={() => input.current?.click()} isDisabled={busy} iconStart={<Upload />}>
                {t.choose}
              </Button>
              <p className={styles.hint}>{t.fileHint}</p>
            </div>
          )}
          {fileError ? <Alert tone="danger" title={fileError} /> : null}
        </Card>

        <div className={styles.aside}>
          <Card as="section" padding="lg" aria-labelledby="details-title" className={styles.card}>
            <h2 id="details-title" className={styles.cardTitle}>
              {t.step.details}
            </h2>
            <TextField placeholder={m.common.ph.analysisName} label={t.name} value={name} onChange={setName} isRequired isDisabled={busy} maxLength={200} />
            <TextField placeholder={m.common.ph.tags} label={t.tags} value={tags} onChange={setTags} description={t.tagsHint} isDisabled={busy} />
            <TextArea placeholder={m.common.ph.note} label={t.note} value={note} onChange={setNote} rows={3} isDisabled={busy} className={styles.note} />
            <Select label={t.movement} placeholder={t.movementPlaceholder} selectedKey={movement || null} onSelectionChange={(key) => setMovement(key ? String(key) : "")} description={t.movementHint} isDisabled={busy}>
              {Object.entries(t.movements).map(([key, label]) => (
                <Option key={key} id={key}>
                  {label}
                </Option>
              ))}
            </Select>
          </Card>

          <section aria-label={t.start} className={styles.startBar}>
            <AccessNotice access={runAccess} />
            {stage.kind !== "idle" ? (
              <div className={styles.progress} role="status" aria-live="polite">
                {stage.kind === "uploading" ? (
                  <>
                    <p className={styles.progressLabel}>
                      {t.uploading} · {t.uploadProgress(Math.round(stage.ratio * 100))}
                    </p>
                    <div className={styles.bar} aria-hidden="true">
                      <span style={{ transform: `scaleX(${stage.ratio})` }} />
                    </div>
                    <Button size="sm" variant="ghost" onPress={() => abort.current?.abort()}>
                      {t.cancelUpload}
                    </Button>
                  </>
                ) : (
                  <p className={styles.progressLabel}>
                    <Spinner size="sm" tone="accent" /> {stage.kind === "verifying" ? t.verifying : t.starting}
                  </p>
                )}
              </div>
            ) : null}
            {file && tracking?.points.length !== 2 && stage.kind === "idle" ? <Alert tone="warning" title={t.needPoints} /> : null}
            {run.error && !isAbortError(run.error) ? <Alert tone="danger" title={errorText(m, run.error)} live="assertive" /> : null}
            <Button type="submit" variant="primary" size="lg" block isDisabled={busy || !runAccess.allowed || !name.trim() || !file || tracking?.points.length !== 2}>
              {t.start}
            </Button>
            <p className={styles.hint}>{t.keepPolicy}</p>
          </section>
        </div>
      </form>
    </>
  );
}

export default function NewAnalysisRoute() {
  const account = useAccountKey();
  return (
    <RequireFeature feature="video.library.manage">
      <NewAnalysis key={account} />
    </RequireFeature>
  );
}
