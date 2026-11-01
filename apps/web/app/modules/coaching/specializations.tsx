import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Schema } from "@metrivum/api-client-web";
import { Star, X } from "lucide-react";
import { Alert, Badge, Button, Card, Combobox, Option } from "@metrivum/ui-web";
import { useAccountContext, useAccountKey, useApi } from "~/shared/session/AccountScope";
import { useWorkspace } from "~/shared/session/WorkspaceScope";
import { useT } from "~/shared/i18n/AppLocale";
import { errorText } from "~/shared/lib/errorText";
import { Failure, Loading } from "./components";
import styles from "./specializations.module.css";

type Category = Schema<"SpecializationCategoryDto">;
type Selections = Schema<"CoachSpecializationsDto">;
type PublicSelection = Schema<"PublicSpecializationDto">;
export type SpecializationDraft = Pick<Selections, "selectedCodes" | "primaryCodes">;
export const emptySpecializations: SpecializationDraft = { selectedCodes: [], primaryCodes: [] };
export const specializationsKey = (account: string) => [account, "coach-specializations"] as const;

export function useSpecializationCatalog() {
  const api = useApi();
  const account = useAccountKey();
  return useQuery({ queryKey: [account, "specialization-catalog"], staleTime: 300_000,
    queryFn: async ({ signal }) => (await api<Category[]>({ path: "/api/v1/coaching/specializations", signal })).data });
}

/** How many specializations a coach may list, and how many of them may be primary (the API enforces the same). */
export const MAX_SPECIALIZATIONS = 10;
export const MAX_PRIMARY = 5;

/**
 * Pick specializations from a searchable list; the chosen ones form a short list underneath. A new pick is primary by
 * default while there is room, and primary rows stand out (accent and a filled star). Canonical English labels come
 * from the API in both UI languages. `filter` (search for coaches) has no primary choice.
 */
export function SpecializationSelector({ categories, value, onChange, filter = false, disabled = false }: {
  categories: Category[]; value: SpecializationDraft; onChange: (next: SpecializationDraft) => void; filter?: boolean; disabled?: boolean;
}) {
  const m = useT();
  const t = m.specializations;
  const [search, setSearch] = useState("");
  const term = search.trim().toLowerCase();
  const all = categories.flatMap(category => category.specializations.map(item => ({ ...item, category: category.name })));
  const byCode = new Map(all.map(item => [item.code, item]));
  const full = value.selectedCodes.length >= MAX_SPECIALIZATIONS;
  const options = all.filter(item => !value.selectedCodes.includes(item.code)
    && `${item.name} ${item.code} ${item.code.replaceAll("_", " ")} ${item.category}`.toLowerCase().includes(term));

  const add = (code: string) => {
    if (disabled || full || value.selectedCodes.includes(code)) return;
    const primary = !filter && value.primaryCodes.length < MAX_PRIMARY;
    onChange({ selectedCodes: [...value.selectedCodes, code], primaryCodes: primary ? [...value.primaryCodes, code] : value.primaryCodes });
    setSearch("");
  };
  const remove = (code: string) => {
    if (disabled) return;
    onChange({ selectedCodes: value.selectedCodes.filter(item => item !== code), primaryCodes: value.primaryCodes.filter(item => item !== code) });
  };
  const togglePrimary = (code: string) => {
    if (disabled) return;
    const isPrimary = value.primaryCodes.includes(code);
    if (!isPrimary && value.primaryCodes.length >= MAX_PRIMARY) return;
    onChange({ ...value, primaryCodes: isPrimary ? value.primaryCodes.filter(item => item !== code) : [...value.primaryCodes, code] });
  };

  return <div className={styles.selector}>
    {/* Re-created after every pick so it closes, empties and stays ready for the next one. */}
    <Combobox key={value.selectedCodes.length} label={t.add} placeholder={full ? t.full : t.search} inputValue={search} onInputChange={setSearch} selectedKey={null}
      onSelectionChange={key => { if (key !== null) add(String(key)); }} isDisabled={disabled || full} allowsEmptyCollection
      defaultFilter={() => true} emptyState={m.common.noResults} description={filter ? t.filterHint : undefined}>
      {options.map(item => <Option key={item.code} id={item.code} textValue={item.name} description={item.category}>{item.name}</Option>)}
    </Combobox>
    <div className={styles.counts} role="status">
      <span className={styles.count} data-full={full || undefined}><strong>{value.selectedCodes.length}</strong>/{MAX_SPECIALIZATIONS} {t.selectedWord}</span>
      {!filter && <span className={styles.count} data-kind="primary" data-full={value.primaryCodes.length >= MAX_PRIMARY || undefined}><Star aria-hidden="true" /><strong>{value.primaryCodes.length}</strong>/{MAX_PRIMARY} {t.primaryWord}</span>}
      {!filter && value.selectedCodes.length > 0 && <span className={styles.countHint}>{t.toggleHint}</span>}
    </div>
    {value.selectedCodes.length > 0 ? <ul className={styles.chipList} aria-label={t.title}>{value.selectedCodes.map(code => {
      const item = byCode.get(code);
      const name = item?.name ?? code;
      const isPrimary = value.primaryCodes.includes(code);
      const locked = !isPrimary && value.primaryCodes.length >= MAX_PRIMARY;
      return <li key={code} className={styles.chip} data-primary={(!filter && isPrimary) || undefined} title={item?.category}>
        {!filter ? <button type="button" className={styles.chipToggle} aria-pressed={isPrimary} aria-label={t.markPrimary(name)}
          disabled={disabled} aria-disabled={locked || undefined} title={locked ? t.primaryFull : undefined} onClick={() => togglePrimary(code)}>
          <Star aria-hidden="true" /><span>{name}</span>
        </button> : <span className={styles.chipLabel}>{name}</span>}
        <button type="button" className={styles.chipRemove} aria-label={t.remove(name)} disabled={disabled} onClick={() => remove(code)}><X aria-hidden="true" /></button>
      </li>;
    })}</ul> : <p className={styles.hint}>{filter ? t.filterEmpty : t.empty}</p>}
  </div>;
}

export function SpecializationPicker(props: Omit<Parameters<typeof SpecializationSelector>[0], "categories">) {
  const catalog = useSpecializationCatalog();
  return catalog.isPending ? <Loading /> : catalog.isError ? <Failure error={catalog.error} retry={catalog.refetch} /> : <SpecializationSelector {...props} categories={catalog.data} />;
}

export function SpecializationBadges({ selections }: { selections: PublicSelection[] | null | undefined }) {
  const t = useT().specializations;
  if (!selections?.length) return null;
  return <ul className={styles.chips} aria-label={t.title}>{selections.map(item => <li key={item.code}><Badge tone={item.isPrimary ? "violet" : "neutral"}>{item.name}{item.isPrimary ? ` · ${t.primary}` : ""}</Badge></li>)}</ul>;
}

export function CoachSpecializationsCard({ selections, editable = false, initialEditing = false }: { selections?: PublicSelection[] | null; editable?: boolean; initialEditing?: boolean }) {
  const t = useT().specializations;
  const { mode } = useWorkspace();
  const canEdit = editable && mode === "coach";
  const [editing, setEditing] = useState(initialEditing);
  if (!canEdit && !selections?.length) return null;
  return <Card as="section" padding="md" className={styles.card}>
    <h2>{t.title}</h2><p className={styles.hint}>{t.description}</p>
    {canEdit && editing ? <SpecializationsEditor /> : <><SpecializationBadges selections={selections} />{!selections?.length && <p>{t.empty}</p>}</>}
    {canEdit && !editing && <Button size="sm" onPress={() => setEditing(true)}>{t.edit}</Button>}
  </Card>;
}

export function SpecializationsEditor() {
  const m = useT();
  const { mode } = useWorkspace();
  const { api, accountKey } = useAccountContext();
  const current = useQuery({ queryKey: specializationsKey(accountKey), enabled: mode === "coach", queryFn: async ({ signal }) => (await api<Selections>({ path: "/api/v1/me/coaching-specializations", signal })).data });
  if (mode !== "coach") return null;
  return current.isPending ? <Loading /> : current.isError ? <Failure error={current.error} retry={current.refetch} /> : <EditorForm saved={current.data} savedLabel={m.specializations.saved} />;
}

function EditorForm({ saved, savedLabel }: { saved: Selections; savedLabel: string }) {
  const m = useT();
  const { api, accountKey, lifecycle } = useAccountContext();
  const cache = useQueryClient();
  const [draft, setDraft] = useState<SpecializationDraft>({ selectedCodes: saved.selectedCodes, primaryCodes: saved.primaryCodes });
  // The version belongs to this draft; a background refetch must not authorize overwriting another edit.
  const [version, setVersion] = useState(saved.version);
  const [success, setSuccess] = useState(false);
  const mutation = useMutation({ mutationFn: async () => (await api<Selections>({ method: "PUT", path: "/api/v1/me/coaching-specializations", json: { ...draft, version } })).data,
    onSuccess: async result => {
      if (!lifecycle.isCurrent()) return;
      setVersion(result.version);
      setSuccess(true);
      cache.setQueryData(specializationsKey(accountKey), result);
      await Promise.all([cache.invalidateQueries({ queryKey: [accountKey, "coach-showcase"] }), cache.invalidateQueries({ queryKey: [accountKey, "coaching"] })]);
    } });
  return <form className={styles.selector} onSubmit={event => { event.preventDefault(); mutation.mutate(); }}>
    <SpecializationPicker value={draft} onChange={next => { setDraft(next); setSuccess(false); }} disabled={mutation.isPending} />
    {mutation.error && <Alert tone="danger" title={errorText(m, mutation.error)} />}
    {success && <p role="status">{savedLabel}</p>}
    <Button type="submit" variant="primary" loading={mutation.isPending}>{m.common.saveChanges}</Button>
  </form>;
}
