import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Award,
  Crown,
  Store,
  FileText,
  ImagePlus,
  Plus,
  Sparkles,
  Trash2,
  TrendingUp,
  UsersRound,
} from "lucide-react";
import { Link as RouterLink } from "react-router";
import { useState } from "react";
import type { Schema } from "@metrivum/api-client-web";
import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  Dialog,
  DialogFooter,
  EmptyState,
  IconButton,
  Option,
  Select,
  Skeleton,
  TextArea,
  TextField,
} from "@metrivum/ui-web";
import { useT } from "~/shared/i18n/AppLocale";
import { errorText } from "~/shared/lib/errorText";
import { useDangerConfirm } from "~/shared/lib/useConfirm";
import { useAccountKey, useApi } from "~/shared/session/AccountScope";
import { SectionTitle, ToneIcon, type Tone } from "./SectionTitle";
import styles from "./CoachShowcase.module.css";

type Showcase = Schema<"CoachShowcaseDto">;
type Item = Schema<"PortfolioItemDto">;
type Kind = Schema<"PortfolioKind">;
type Upload = Schema<"DocumentUpload">;
type ReadUrl = Schema<"DocumentReadUrl">;

const KINDS: Kind[] = ["Certificate", "ClientResult", "Other"];
const ACCEPT = "image/png,image/jpeg,image/webp,application/pdf";
const MAX_BYTES = 20 * 1024 * 1024;

export const showcaseKey = (account: string, coachId: string) =>
  [account, "coach-showcase", coachId] as const;

export function useShowcase(coachId: string, enabled = true) {
  const api = useApi();
  const account = useAccountKey();
  return useQuery({
    queryKey: showcaseKey(account, coachId),
    queryFn: async ({ signal }) =>
      (
        await api<Showcase>({
          path: `/api/v1/coaches/${coachId}/showcase`,
          signal,
        })
      ).data,
    enabled: enabled && Boolean(coachId),
  });
}

/** Month and year the coach joined, e.g. "March 2026". */
export function joined(locale: string, value: string | null | undefined) {
  return value
    ? new Intl.DateTimeFormat(locale, {
        month: "long",
        year: "numeric",
      }).format(new Date(value))
    : null;
}

export type StatItem = {
  icon: typeof Award;
  label: string;
  value: string | null;
  tone?: Tone;
};

/** A strip of numbers in equal cells that wrap evenly; a null value shows a skeleton (or a dash after a failure). */
export function StatsStrip({
  items,
  label,
  failed = false,
}: {
  items: StatItem[];
  label: string;
  failed?: boolean;
}) {
  return (
    <ul
      className={styles.stats}
      aria-label={label}
      data-count={items.length}
      style={{ "--n": items.length } as React.CSSProperties}
    >
      {items.map(({ icon: Icon, label: name, value, tone = "green" }) => (
        <li key={name}>
          <ToneIcon tone={tone}>
            <Icon />
          </ToneIcon>
          <span className={styles.statValue}>
            {value ??
              (failed ? "—" : <Skeleton width="2.5rem" height="1.5rem" />)}
          </span>
          <span className={styles.statLabel}>{name}</span>
        </li>
      ))}
    </ul>
  );
}

/** Clients, experience, time on the platform, offers and portfolio: the numbers a visitor checks first. */
export function ShowcaseStats({
  showcase,
  offers,
  failed = false,
}: {
  showcase: Showcase | undefined;
  offers?: number;
  failed?: boolean;
}) {
  const t = useT().profile.showcase;
  const items: StatItem[] = [
    {
      icon: UsersRound,
      tone: "green",
      label: t.activeClients,
      value: showcase ? String(showcase.activeClients) : null,
    },
    {
      icon: TrendingUp,
      tone: "blue",
      label: t.clientsCoached,
      value: showcase ? String(showcase.clientsCoached) : null,
    },
    {
      icon: Award,
      tone: "violet",
      label: t.experience,
      value: showcase
        ? showcase.yearsExperience != null
          ? t.years(Number(showcase.yearsExperience))
          : "—"
        : null,
    },
    {
      icon: Store,
      tone: "green",
      label: t.offersStat,
      value: offers !== undefined ? String(offers) : null,
    },
    {
      icon: FileText,
      tone: "orange",
      label: t.portfolioStat,
      value: showcase ? String(showcase.portfolio.length) : null,
    },
    {
      icon: Sparkles,
      tone: "rose",
      label: t.competenciesStat,
      value: showcase ? String(showcase.competencies.length) : null,
    },
  ];
  return <StatsStrip items={items} label={t.statsLabel} failed={failed} />;
}

/** The coach's competencies. The owner edits them in the profile's edit mode. */
export function ShowcaseAbout({
  showcase,
  own = false,
}: {
  showcase: Showcase | undefined;
  own?: boolean;
}) {
  const t = useT().profile.showcase;
  if (!showcase) return <Skeleton height="6rem" />;
  if (!showcase.competencies.length && !own) return null;
  return (
    <Card
      as="section"
      padding="md"
      aria-labelledby="showcase-about"
      className={styles.card}
      data-empty={!showcase.competencies.length || undefined}
    >
      <SectionTitle
        id="showcase-about"
        icon={<Sparkles />}
        tone="blue"
        title={t.competencies}
        sub={own ? t.competenciesSubOwn : t.competenciesSub}
      />
      {showcase.competencies.length ? (
        <ul className={styles.tags}>
          {showcase.competencies.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : (
        <EmptyState
          size="sm"
          className={styles.empty}
          icon={<Sparkles />}
          title={t.emptyOwn}
          description={t.emptyOwnBody}
        />
      )}
    </Card>
  );
}

/** Certificates, client results and other files, as cards that open the file. */
export function Portfolio({
  coachId,
  showcase,
  editable,
}: {
  coachId: string;
  showcase: Showcase | undefined;
  editable: boolean;
}) {
  const m = useT();
  const t = m.profile.showcase;
  const api = useApi();
  const account = useAccountKey();
  const cache = useQueryClient();
  const [adding, setAdding] = useState(false);
  const { ask, dialog } = useDangerConfirm();
  const remove = useMutation({
    mutationFn: async (item: Item) =>
      api({
        method: "DELETE",
        path: `/api/v1/me/coach-showcase/portfolio/${item.id}`,
      }),
    onSuccess: () =>
      cache.invalidateQueries({ queryKey: showcaseKey(account, coachId) }),
  });
  if (!showcase) return <Skeleton height="8rem" />;
  const items = showcase.portfolio;
  if (!items.length && !editable) return null;
  return (
    <Card
      as="section"
      padding="md"
      aria-labelledby="showcase-portfolio"
      className={styles.card}
      data-empty={!items.length || undefined}
    >
      <SectionTitle
        id="showcase-portfolio"
        icon={<Award />}
        tone="orange"
        title={t.portfolio}
        sub={editable ? t.portfolioHintOwn : t.portfolioHint}
        actions={
          editable ? (
            <Button
              size="sm"
              iconStart={<Plus />}
              onPress={() => setAdding(true)}
              isDisabled={items.length >= 30}
            >
              {t.addFile}
            </Button>
          ) : undefined
        }
      />
      {remove.error ? (
        <Alert tone="danger" title={errorText(m, remove.error)} />
      ) : null}
      {!items.length ? (
        <EmptyState
          size="sm"
          className={styles.empty}
          icon={<Award />}
          title={t.noFiles}
          description={t.noFilesBody}
        />
      ) : (
        <ul className={styles.portfolio}>
          {items.map((item) => (
            <PortfolioCard
              key={item.id}
              coachId={coachId}
              item={item}
              onRemove={
                editable
                  ? async () => {
                      if (
                        await ask({
                          title: t.removeTitle(item.title),
                          body: t.removeBody,
                          confirmLabel: t.remove,
                        })
                      )
                        remove.mutate(item);
                    }
                  : undefined
              }
            />
          ))}
        </ul>
      )}
      {adding ? (
        <AddDialog coachId={coachId} close={() => setAdding(false)} />
      ) : null}
      {dialog}
    </Card>
  );
}

function PortfolioCard({
  coachId,
  item,
  onRemove,
}: {
  coachId: string;
  item: Item;
  onRemove?: () => void;
}) {
  const t = useT().profile.showcase;
  const api = useApi();
  const account = useAccountKey();
  const image = item.contentType.startsWith("image/");
  // Images show a thumbnail; the signed link is short-lived, so it is fetched when the card renders.
  const link = useQuery({
    queryKey: [account, "coach-showcase", coachId, "file", item.id],
    queryFn: async () =>
      (
        await api<ReadUrl>({
          method: "POST",
          path: `/api/v1/coaches/${coachId}/showcase/portfolio/${item.id}/read-url`,
        })
      ).data,
    enabled: image,
    staleTime: 60_000,
  });
  const open = async () => {
    const url =
      image && link.data
        ? link.data.url
        : (
            await api<ReadUrl>({
              method: "POST",
              path: `/api/v1/coaches/${coachId}/showcase/portfolio/${item.id}/read-url`,
            })
          ).data.url;
    window.open(url, "_blank", "noopener,noreferrer");
  };
  const Icon =
    item.kind === "Certificate"
      ? Award
      : item.kind === "ClientResult"
        ? TrendingUp
        : FileText;
  return (
    <li className={styles.item}>
      <button
        type="button"
        className={styles.preview}
        onClick={() => void open()}
        aria-label={t.openFile(item.title)}
      >
        {image && link.data ? (
          <img src={link.data.url} alt="" loading="lazy" />
        ) : (
          <span className={styles.glyph}>
            <Icon aria-hidden="true" />
            <small>{item.contentType === "application/pdf" ? "PDF" : ""}</small>
          </span>
        )}
      </button>
      <div className={styles.itemText}>
        <div className={styles.itemHead}>
          <strong>{item.title}</strong>
          {onRemove ? (
            <IconButton
              size="sm"
              variant="ghost"
              icon={<Trash2 />}
              label={t.remove}
              onPress={onRemove}
            />
          ) : null}
        </div>
        <Badge
          size="sm"
          tone={
            item.kind === "Certificate"
              ? "violet"
              : item.kind === "ClientResult"
                ? "success"
                : "neutral"
          }
        >
          {t.kinds[item.kind]}
        </Badge>
        {item.description ? <p>{item.description}</p> : null}
      </div>
    </li>
  );
}

function AddDialog({ coachId, close }: { coachId: string; close: () => void }) {
  const m = useT();
  const t = m.profile.showcase;
  const api = useApi();
  const account = useAccountKey();
  const cache = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [kind, setKind] = useState<Kind>("Certificate");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [consent, setConsent] = useState(false);
  const tooBig = file ? file.size > MAX_BYTES : false;
  const save = useMutation({
    mutationFn: async () => {
      const ticket = (
        await api<Upload>({
          method: "POST",
          path: "/api/v1/me/coach-showcase/portfolio/uploads",
          json: { name: file!.name, contentType: file!.type, size: file!.size },
        })
      ).data;
      const sent = await fetch(ticket.uploadUrl, {
        method: ticket.method,
        headers: { "Content-Type": file!.type, "x-upsert": "false" },
        body: file,
        credentials: "omit",
      });
      if (!sent.ok) throw new Error(t.uploadFailed);
      await api({
        method: "POST",
        path: "/api/v1/me/coach-showcase/portfolio",
        json: {
          mediaId: ticket.mediaId,
          kind,
          title: title.trim(),
          description: description.trim() || null,
        },
      });
    },
    onSuccess: async () => {
      await cache.invalidateQueries({
        queryKey: showcaseKey(account, coachId),
      });
      close();
    },
  });
  const needsConsent = kind === "ClientResult";
  return (
    <Dialog
      isOpen
      title={t.addTitle}
      onOpenChange={(open) => !open && !save.isPending && close()}
    >
      <form
        className={styles.form}
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate();
        }}
      >
        <label className={styles.drop}>
          <input
            type="file"
            accept={ACCEPT}
            onChange={(event) => {
              const next = event.target.files?.[0] ?? null;
              setFile(next);
              if (next && !title)
                setTitle(next.name.replace(/\.[^.]+$/, "").slice(0, 120));
            }}
          />
          <span className={styles.dropTitle}>
            {file ? file.name : t.chooseFile}
          </span>
          <span className={styles.muted}>
            {tooBig ? t.tooBig : t.fileTypes}
          </span>
        </label>
        <Select
          label={t.kind}
          selectedKey={kind}
          onSelectionChange={(key) => setKind(String(key) as Kind)}
        >
          {KINDS.map((item) => (
            <Option key={item} id={item}>
              {t.kinds[item]}
            </Option>
          ))}
        </Select>
        <TextField
          label={t.fileTitle}
          placeholder={t.fileTitlePlaceholder}
          value={title}
          onChange={setTitle}
          maxLength={120}
          isRequired
        />
        <TextArea
          label={t.description}
          placeholder={t.descriptionPlaceholder}
          value={description}
          onChange={setDescription}
          maxLength={1000}
        />
        {needsConsent ? (
          <Checkbox isSelected={consent} onChange={setConsent}>
            {t.consent}
          </Checkbox>
        ) : null}
        <p className={styles.muted}>{t.publicNote}</p>
        {save.error ? (
          <Alert tone="danger" title={errorText(m, save.error)} />
        ) : null}
        <DialogFooter>
          <Button onPress={close} isDisabled={save.isPending}>
            {m.common.cancel}
          </Button>
          <Button
            type="submit"
            variant="primary"
            loading={save.isPending}
            isDisabled={
              !file || tooBig || !title.trim() || (needsConsent && !consent)
            }
          >
            {t.upload}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}

/** Shown in place of the showcase sections when they could not be loaded, with a retry. */
export function ShowcaseFailed({
  error,
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  const m = useT();
  return (
    <div className={styles.failed} role="status">
      <span>
        {m.profile.showcase.failed} {errorText(m, error)}
      </span>
      <Button size="sm" onPress={retry}>
        {m.common.retry}
      </Button>
    </div>
  );
}

type Subscription = Schema<"PlatformSubscriptionDto">;

/** The cover photo's short-lived link, when the coach has one. */
export function useCoverUrl(coachId: string, hasCover: boolean | undefined) {
  const api = useApi();
  const account = useAccountKey();
  return useQuery({
    queryKey: [account, "coach-showcase", coachId, "cover"],
    queryFn: async () =>
      (
        await api<ReadUrl>({
          method: "POST",
          path: `/api/v1/coaches/${coachId}/showcase/cover/read-url`,
        })
      ).data.url,
    enabled: Boolean(hasCover),
    staleTime: 60_000,
  });
}

/** On the own coach profile: change or remove the cover photo (Pro), or a pointer to Pro. */
export function CoverControls({
  coachId,
  showcase,
}: {
  coachId: string;
  showcase: Showcase | undefined;
}) {
  const m = useT();
  const t = m.profile.showcase;
  const api = useApi();
  const account = useAccountKey();
  const cache = useQueryClient();
  const plan = useQuery({
    queryKey: [account, "coaching", "/api/v1/me/platform-subscription"],
    queryFn: async ({ signal }) =>
      (
        await api<Subscription>({
          path: "/api/v1/me/platform-subscription",
          signal,
        })
      ).data,
  });
  const pro = plan.data?.planId === "Pro" || plan.data?.planId === "Team";
  const done = (saved: Showcase) => {
    cache.setQueryData(showcaseKey(account, coachId), saved);
    void cache.invalidateQueries({
      queryKey: [account, "coach-showcase", coachId, "cover"],
    });
  };
  const upload = useMutation({
    mutationFn: async (file: File) => {
      if (!file.type.startsWith("image/") || file.size > MAX_BYTES)
        throw new Error(t.coverInvalid);
      const ticket = (
        await api<Upload>({
          method: "POST",
          path: "/api/v1/me/coach-showcase/cover/uploads",
          json: { name: file.name, contentType: file.type, size: file.size },
        })
      ).data;
      const sent = await fetch(ticket.uploadUrl, {
        method: ticket.method,
        headers: { "Content-Type": file.type, "x-upsert": "false" },
        body: file,
        credentials: "omit",
      });
      if (!sent.ok) throw new Error(t.uploadFailed);
      return (
        await api<Showcase>({
          method: "PUT",
          path: "/api/v1/me/coach-showcase/cover",
          json: { mediaId: ticket.mediaId },
        })
      ).data;
    },
    onSuccess: done,
  });
  const remove = useMutation({
    mutationFn: async () =>
      (
        await api<Showcase>({
          method: "DELETE",
          path: "/api/v1/me/coach-showcase/cover",
        })
      ).data,
    onSuccess: done,
  });
  if (!plan.data || !showcase) return null;
  return (
    <div className={styles.coverControls}>
      {pro ? (
        <>
          <label
            className={styles.coverButton}
            data-busy={upload.isPending || undefined}
          >
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              disabled={upload.isPending}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) upload.mutate(file);
              }}
            />
            <ImagePlus aria-hidden="true" />
            {upload.isPending
              ? t.coverUploading
              : showcase.hasCover
                ? t.changeCover
                : t.addCover}
          </label>
          {showcase.hasCover ? (
            <button
              type="button"
              className={styles.coverButton}
              onClick={() => remove.mutate()}
              disabled={remove.isPending}
            >
              <Trash2 aria-hidden="true" />
              {t.removeCover}
            </button>
          ) : null}
        </>
      ) : (
        <RouterLink to="/app/subscription" className={styles.coverButton}>
          <Crown aria-hidden="true" />
          {t.coverPro}
        </RouterLink>
      )}
      {upload.error || remove.error ? (
        <span className={styles.coverError} role="alert">
          {errorText(m, upload.error ?? remove.error)}
        </span>
      ) : null}
    </div>
  );
}
