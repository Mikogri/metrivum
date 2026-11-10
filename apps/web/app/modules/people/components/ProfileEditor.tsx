import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Palette, Sparkles, UserRound, X } from "lucide-react";
import {
  useEffect,
  useId,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import type { ProfileResponse, Schema } from "@metrivum/api-client-web";
import {
  Button,
  Card,
  NumberInput,
  TextArea,
  TextField,
} from "@metrivum/ui-web";
import {
  displayNameValid,
  normalizeDisplayName,
  profileKey,
  updateProfile,
} from "~/modules/accounts";
import {
  Failure,
  Loading,
  SpecializationPicker,
  specializationsKey,
  type SpecializationDraft,
} from "~/modules/coaching";
import { useT } from "~/shared/i18n/AppLocale";
import { useAccountKey, useApi } from "~/shared/session/AccountScope";
import { CoverEditor } from "~/shared/ui/cover/CoverEditor";
import {
  DEFAULT_BACKDROP,
  resolveCover,
  changedProps,
  type CoverStyle,
} from "~/shared/ui/cover/coverStyle";
import { showcaseKey } from "./CoachShowcase";
import styles from "./ProfileEditor.module.css";

type Showcase = Schema<"CoachShowcaseDto">;
type Selections = Schema<"CoachSpecializationsDto">;

/** What one editor card tells the page: whether it has changes, whether they are valid, and how to save them. */
export type EditorHandle = {
  dirty: boolean;
  valid: boolean;
  save: () => Promise<void>;
};
export type RegisterEditor = (key: string, handle: EditorHandle) => void;

/** Keeps the page's single "Save changes" button in step with this card. */
function useEditorHandle(
  register: RegisterEditor,
  key: string,
  handle: EditorHandle,
) {
  useEffect(() => register(key, handle));
}

/** A saved cover in the shape the editor works with (unknown shapes fall back to the default). */
export function coverDraftOf(saved: unknown): CoverStyle {
  const { entry, props, backdrop } = resolveCover(saved);
  return {
    background: entry.name,
    props: changedProps(entry, props),
    ...(backdrop !== DEFAULT_BACKDROP ? { backdrop } : {}),
  };
}

function EditorCard({
  id,
  icon,
  title,
  hint,
  children,
}: {
  id: string;
  icon: ReactNode;
  title: string;
  hint: string;
  children: ReactNode;
}) {
  return (
    <Card
      as="section"
      padding="md"
      aria-labelledby={id}
      className={styles.card}
    >
      <header className={styles.head}>
        <h2 id={id} className={styles.title}>
          {icon}
          {title}
        </h2>
        <p className={styles.muted}>{hint}</p>
      </header>
      {children}
    </Card>
  );
}

/** The animated cover: background and settings, previewed live in the header above. */
export function CoverEditorCard({
  saved,
  draft,
  onDraft,
  onRestart,
  register,
}: {
  saved: unknown;
  draft: CoverStyle;
  onDraft: (next: CoverStyle) => void;
  onRestart: () => void;
  register: RegisterEditor;
}) {
  const t = useT().profile.editor;
  const api = useApi();
  const account = useAccountKey();
  const cache = useQueryClient();
  const dirty = JSON.stringify(draft) !== JSON.stringify(coverDraftOf(saved));
  useEditorHandle(register, "cover", {
    dirty,
    valid: true,
    save: async () => {
      const profile = (
        await api<ProfileResponse>({
          method: "PUT",
          path: "/api/v1/me/cover-style",
          json: { style: draft },
        })
      ).data;
      cache.setQueryData(profileKey(account), profile);
    },
  });
  return (
    <EditorCard
      id="edit-cover"
      icon={<Palette aria-hidden="true" />}
      title={t.coverTitle}
      hint={t.coverHint}
    >
      <CoverEditor
        value={draft}
        onChange={onDraft}
        onRestart={onRestart}
        text={{
          background: t.background,
          previous: t.previousBackground,
          next: t.nextBackground,
          reset: t.resetBackground,
          restart: t.restart,
          changed: t.changed,
          addColour: t.addColour,
          removeColour: t.removeColour,
          backdrop: t.backdrop,
        }}
      />
    </EditorCard>
  );
}

/** Name, introduction and, for coaches, headline, experience and competencies. */
export function IdentityEditorCard({
  profile,
  showcase,
  register,
}: {
  profile: ProfileResponse;
  showcase: Showcase | undefined;
  register: RegisterEditor;
}) {
  const m = useT();
  const t = m.profile.editor;
  const s = m.profile.showcase;
  const api = useApi();
  const account = useAccountKey();
  const cache = useQueryClient();
  const tagLabel = useId();
  const tagHint = useId();
  const coach = profile.roles.includes("Coach");
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [bio, setBio] = useState(profile.bio ?? "");
  const [headline, setHeadline] = useState(showcase?.headline ?? "");
  const [years, setYears] = useState<number>(
    showcase?.yearsExperience != null ? Number(showcase.yearsExperience) : NaN,
  );
  const [tags, setTags] = useState<string[]>(
    showcase ? [...showcase.competencies] : [],
  );
  const [draft, setDraft] = useState("");
  const nameOk = displayNameValid(displayName);
  const profileDirty =
    normalizeDisplayName(displayName) !== profile.displayName ||
    bio.trim() !== (profile.bio ?? "");
  const showcaseDirty =
    coach &&
    Boolean(showcase) &&
    (headline.trim() !== (showcase?.headline ?? "") ||
      (Number.isNaN(years) ? null : years) !==
        (showcase?.yearsExperience != null
          ? Number(showcase.yearsExperience)
          : null) ||
      JSON.stringify(tags) !== JSON.stringify(showcase?.competencies ?? []));
  const add = () => {
    const value = draft.trim().slice(0, 40);
    if (
      value &&
      tags.length < 20 &&
      !tags.some((tag) => tag.toLowerCase() === value.toLowerCase())
    )
      setTags([...tags, value]);
    setDraft("");
  };
  const onKey = (event: KeyboardEvent) => {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      add();
    }
  };
  useEditorHandle(register, "identity", {
    dirty: profileDirty || showcaseDirty,
    valid: nameOk,
    save: async () => {
      if (profileDirty) {
        const saved = await updateProfile(
          api,
          {
            displayName: normalizeDisplayName(displayName),
            locale: profile.locale,
            timeZone: profile.timeZone,
            bio: bio.trim(),
          },
          Number(profile.version),
        );
        cache.setQueryData(profileKey(account), saved);
      }
      if (showcaseDirty && showcase) {
        const saved = (
          await api<Showcase>({
            method: "PUT",
            path: "/api/v1/me/coach-showcase",
            json: {
              headline: headline.trim() || null,
              yearsExperience: Number.isNaN(years) ? null : years,
              competencies: tags,
              version: showcase.version,
            },
          })
        ).data;
        cache.setQueryData(showcaseKey(account, profile.id), saved);
      }
    },
  });
  return (
    <EditorCard
      id="edit-identity"
      icon={<UserRound aria-hidden="true" />}
      title={t.identityTitle}
      hint={t.identityHint}
    >
      <div className={styles.grid}>
        <TextField
          label={t.displayName}
          description={t.displayNameHint}
          value={displayName}
          onChange={setDisplayName}
          maxLength={80}
          isRequired
          isInvalid={!nameOk}
          errorMessage={m.onboarding.displayNameInvalid}
        />
        {coach ? (
          <TextField
            label={s.headline}
            placeholder={s.headlinePlaceholder}
            description={s.headlineHint}
            value={headline}
            onChange={setHeadline}
            maxLength={160}
          />
        ) : null}
        <TextArea
          className={styles.wide}
          label={t.bio}
          placeholder={t.bioPlaceholder}
          description={t.bioHint(bio.trim().length)}
          value={bio}
          onChange={setBio}
          maxLength={500}
        />
        {coach ? (
          <>
            <NumberInput
              label={s.yearsLabel}
              description={s.yearsHint}
              placeholder="5"
              value={years}
              onChange={setYears}
              minValue={0}
              maxValue={80}
              formatOptions={{ maximumFractionDigits: 0 }}
            />
            {/* Label and hint above the whole row, like every other field, so the Add button lines up with the input. */}
            <div className={styles.tagEditor}>
              <span id={tagLabel} className={styles.fieldLabel}>
                {s.competencies}
              </span>
              <span id={tagHint} className={styles.fieldHint}>
                {s.competencyHint(tags.length)}
              </span>
              <div className={styles.tagRow}>
                <TextField
                  aria-labelledby={tagLabel}
                  aria-describedby={tagHint}
                  placeholder={s.competencyPlaceholder}
                  value={draft}
                  onChange={setDraft}
                  onKeyDown={onKey}
                  maxLength={40}
                />
                <Button
                  onPress={add}
                  isDisabled={!draft.trim() || tags.length >= 20}
                >
                  {s.addCompetency}
                </Button>
              </div>
            </div>
            {tags.length ? (
              <ul className={`${styles.tags} ${styles.wide}`}>
                {tags.map((tag) => (
                  <li key={tag}>
                    {tag}
                    <button
                      type="button"
                      aria-label={s.removeCompetency(tag)}
                      onClick={() =>
                        setTags(tags.filter((item) => item !== tag))
                      }
                    >
                      <X aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        ) : null}
      </div>
    </EditorCard>
  );
}

/** Coaching specializations, edited here only (the profile shows them read-only). */
export function SpecializationsEditorCard({
  register,
}: {
  register: RegisterEditor;
}) {
  const m = useT();
  const api = useApi();
  const account = useAccountKey();
  const current = useQuery({
    queryKey: specializationsKey(account),
    queryFn: async ({ signal }) =>
      (
        await api<Selections>({
          path: "/api/v1/me/coaching-specializations",
          signal,
        })
      ).data,
  });
  return (
    <EditorCard
      id="edit-specializations"
      icon={<Sparkles aria-hidden="true" />}
      title={m.specializations.title}
      hint={m.specializations.description}
    >
      {current.isPending ? (
        <Loading />
      ) : current.isError ? (
        <Failure error={current.error} retry={() => void current.refetch()} />
      ) : (
        <SpecializationsDraft saved={current.data} register={register} />
      )}
    </EditorCard>
  );
}

function SpecializationsDraft({
  saved,
  register,
}: {
  saved: Selections;
  register: RegisterEditor;
}) {
  const api = useApi();
  const account = useAccountKey();
  const cache = useQueryClient();
  const [draft, setDraft] = useState<SpecializationDraft>({
    selectedCodes: saved.selectedCodes,
    primaryCodes: saved.primaryCodes,
  });
  useEditorHandle(register, "specializations", {
    dirty:
      JSON.stringify(draft.selectedCodes) !==
        JSON.stringify(saved.selectedCodes) ||
      JSON.stringify(draft.primaryCodes) !== JSON.stringify(saved.primaryCodes),
    valid: true,
    save: async () => {
      const result = (
        await api<Selections>({
          method: "PUT",
          path: "/api/v1/me/coaching-specializations",
          json: { ...draft, version: saved.version },
        })
      ).data;
      cache.setQueryData(specializationsKey(account), result);
      await Promise.all([
        cache.invalidateQueries({ queryKey: [account, "coach-showcase"] }),
        cache.invalidateQueries({ queryKey: [account, "coaching"] }),
      ]);
    },
  });
  return <SpecializationPicker value={draft} onChange={setDraft} />;
}
