import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Palette, UserRound, X } from "lucide-react";
import { useState, type KeyboardEvent } from "react";
import type { ProfileResponse, Schema } from "@trainflow/api-client-web";
import { Alert, Button, Card, NumberInput, TextArea, TextField, toast } from "@trainflow/ui-web";
import { displayNameValid, normalizeDisplayName, profileKey, updateProfile } from "~/modules/accounts";
import { useT } from "~/shared/i18n/AppLocale";
import { errorText } from "~/shared/lib/errorText";
import { useAccountKey, useApi } from "~/shared/session/AccountScope";
import { CoverEditor } from "~/shared/ui/cover/CoverEditor";
import { DEFAULT_BACKDROP, resolveCover, changedProps, type CoverStyle } from "~/shared/ui/cover/coverStyle";
import { showcaseKey } from "./CoachShowcase";
import styles from "./ProfileEditor.module.css";

type Showcase = Schema<"CoachShowcaseDto">;

/** A saved cover in the shape the editor works with (unknown shapes fall back to the default). */
export function coverDraftOf(saved: unknown): CoverStyle {
  const { entry, props, backdrop } = resolveCover(saved);
  return { background: entry.name, props: changedProps(entry, props), ...(backdrop !== DEFAULT_BACKDROP ? { backdrop } : {}) };
}

/** The animated cover: background and settings, previewed live in the header above. */
export function CoverEditorCard({ saved, draft, onDraft, onRestart }: { saved: unknown; draft: CoverStyle; onDraft: (next: CoverStyle) => void; onRestart: () => void }) {
  const m = useT();
  const t = m.profile.editor;
  const api = useApi();
  const account = useAccountKey();
  const cache = useQueryClient();
  const dirty = JSON.stringify(draft) !== JSON.stringify(coverDraftOf(saved));
  const save = useMutation({
    mutationFn: async () => (await api<ProfileResponse>({ method: "PUT", path: "/api/v1/me/cover-style", json: { style: draft } })).data,
    onSuccess: (profile) => {
      cache.setQueryData(profileKey(account), profile);
      toast({ tone: "success", title: t.coverSaved });
    },
  });
  return (
    <Card as="section" padding="md" aria-labelledby="edit-cover" className={styles.card}>
      <header className={styles.head}>
        <div>
          <h2 id="edit-cover" className={styles.title}>
            <Palette aria-hidden="true" />
            {t.coverTitle}
          </h2>
          <p className={styles.muted}>{t.coverHint}</p>
        </div>
        <div className={styles.buttons}>
          {dirty ? (
            <Button size="sm" variant="ghost" onPress={() => onDraft(coverDraftOf(saved))} isDisabled={save.isPending}>
              {m.common.cancel}
            </Button>
          ) : null}
          <Button size="sm" variant="primary" onPress={() => save.mutate()} loading={save.isPending} isDisabled={!dirty}>
            {t.saveCover}
          </Button>
        </div>
      </header>
      {save.error ? <Alert tone="danger" title={errorText(m, save.error)} /> : null}
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
    </Card>
  );
}

/** Name, introduction and, for coaches, headline, experience and competencies, saved together. */
export function IdentityEditorCard({ profile, showcase }: { profile: ProfileResponse; showcase: Showcase | undefined }) {
  const m = useT();
  const t = m.profile.editor;
  const s = m.profile.showcase;
  const api = useApi();
  const account = useAccountKey();
  const cache = useQueryClient();
  const coach = profile.roles.includes("Coach");
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [bio, setBio] = useState(profile.bio ?? "");
  const [headline, setHeadline] = useState(showcase?.headline ?? "");
  const [years, setYears] = useState<number>(showcase?.yearsExperience != null ? Number(showcase.yearsExperience) : NaN);
  const [tags, setTags] = useState<string[]>(showcase ? [...showcase.competencies] : []);
  const [draft, setDraft] = useState("");
  const nameOk = displayNameValid(displayName);
  const profileDirty = normalizeDisplayName(displayName) !== profile.displayName || bio.trim() !== (profile.bio ?? "");
  const showcaseDirty =
    coach &&
    Boolean(showcase) &&
    (headline.trim() !== (showcase?.headline ?? "") ||
      (Number.isNaN(years) ? null : years) !== (showcase?.yearsExperience != null ? Number(showcase.yearsExperience) : null) ||
      JSON.stringify(tags) !== JSON.stringify(showcase?.competencies ?? []));
  const add = () => {
    const value = draft.trim().slice(0, 40);
    if (value && tags.length < 20 && !tags.some((tag) => tag.toLowerCase() === value.toLowerCase())) setTags([...tags, value]);
    setDraft("");
  };
  const onKey = (event: KeyboardEvent) => {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      add();
    }
  };
  const save = useMutation({
    mutationFn: async () => {
      if (profileDirty) {
        const saved = await updateProfile(api, { displayName: normalizeDisplayName(displayName), locale: profile.locale, timeZone: profile.timeZone, bio: bio.trim() }, Number(profile.version));
        cache.setQueryData(profileKey(account), saved);
      }
      if (showcaseDirty && showcase) {
        const saved = (await api<Showcase>({ method: "PUT", path: "/api/v1/me/coach-showcase", json: { headline: headline.trim() || null, yearsExperience: Number.isNaN(years) ? null : years, competencies: tags, version: showcase.version } })).data;
        cache.setQueryData(showcaseKey(account, profile.id), saved);
      }
    },
    onSuccess: () => toast({ tone: "success", title: t.saved }),
  });
  return (
    <Card as="section" padding="md" aria-labelledby="edit-identity" className={styles.card}>
      <header className={styles.head}>
        <div>
          <h2 id="edit-identity" className={styles.title}>
            <UserRound aria-hidden="true" />
            {t.identityTitle}
          </h2>
          <p className={styles.muted}>{t.identityHint}</p>
        </div>
        <Button size="sm" variant="primary" onPress={() => save.mutate()} loading={save.isPending} isDisabled={!(profileDirty || showcaseDirty) || !nameOk}>
          {m.common.saveChanges}
        </Button>
      </header>
      {save.error ? <Alert tone="danger" title={errorText(m, save.error)} /> : null}
      <div className={styles.grid}>
        <TextField label={t.displayName} value={displayName} onChange={setDisplayName} maxLength={80} isRequired isInvalid={!nameOk} errorMessage={m.onboarding.displayNameInvalid} />
        {coach ? <TextField label={s.headline} placeholder={s.headlinePlaceholder} description={s.headlineHint} value={headline} onChange={setHeadline} maxLength={160} /> : null}
        <TextArea className={styles.wide} label={t.bio} placeholder={t.bioPlaceholder} description={t.bioHint(bio.trim().length)} value={bio} onChange={setBio} maxLength={500} />
        {coach ? (
          <>
            <NumberInput label={s.yearsLabel} placeholder="5" value={years} onChange={setYears} minValue={0} maxValue={80} formatOptions={{ maximumFractionDigits: 0 }} />
            <div className={styles.tagEditor}>
              <TextField label={s.competencies} placeholder={s.competencyPlaceholder} description={s.competencyHint(tags.length)} value={draft} onChange={setDraft} onKeyDown={onKey} maxLength={40} />
              <Button size="sm" onPress={add} isDisabled={!draft.trim() || tags.length >= 20}>
                {s.addCompetency}
              </Button>
            </div>
            {tags.length ? (
              <ul className={`${styles.tags} ${styles.wide}`}>
                {tags.map((tag) => (
                  <li key={tag}>
                    {tag}
                    <button type="button" aria-label={s.removeCompetency(tag)} onClick={() => setTags(tags.filter((item) => item !== tag))}>
                      <X aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        ) : null}
      </div>
    </Card>
  );
}
