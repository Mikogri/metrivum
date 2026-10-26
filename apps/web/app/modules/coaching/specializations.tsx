import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Schema } from "@trainflow/api-client-web";
import { Alert, Badge, Button, Card, Checkbox, SearchInput } from "@trainflow/ui-web";
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

/** Canonical English labels come from the API in both UI languages. */
export function SpecializationSelector({ categories, value, onChange, filter = false, disabled = false }: {
  categories: Category[]; value: SpecializationDraft; onChange: (next: SpecializationDraft) => void; filter?: boolean; disabled?: boolean;
}) {
  const m = useT();
  const t = m.specializations;
  const [search, setSearch] = useState("");
  const term = search.trim().toLowerCase();
  const visible = categories.map(category => ({ ...category, specializations: category.specializations.filter(item =>
    `${item.name} ${item.code} ${item.code.replaceAll("_", " ")} ${category.name}`.toLowerCase().includes(term)) })).filter(category => category.specializations.length);
  const all = categories.flatMap(category => category.specializations);
  const select = (code: string, checked: boolean) => {
    if (disabled || (checked && value.selectedCodes.length >= 5)) return;
    onChange({ selectedCodes: checked ? [...value.selectedCodes, code] : value.selectedCodes.filter(item => item !== code), primaryCodes: value.primaryCodes.filter(item => checked || item !== code) });
  };
  const primary = (code: string, checked: boolean) => {
    if (disabled || !value.selectedCodes.includes(code) || (checked && value.primaryCodes.length >= 3)) return;
    onChange({ ...value, primaryCodes: checked ? [...value.primaryCodes, code] : value.primaryCodes.filter(item => item !== code) });
  };
  return <div className={styles.selector}>
    <SearchInput aria-label={t.search} placeholder={t.search} value={search} onChange={setSearch} isDisabled={disabled} />
    <div className={styles.counts} role="status"><span>{t.selected(value.selectedCodes.length)}</span>{!filter && <span>{t.primaryCount(value.primaryCodes.length)}</span>}</div>
    <p className={styles.hint}>{filter ? t.filterHint : t.limit}</p>
    {value.selectedCodes.length > 0 && <ul className={styles.chips} aria-label={t.title}>{value.selectedCodes.map(code => {
      const name = all.find(item => item.code === code)?.name ?? code;
      return <li key={code}><Badge tone={value.primaryCodes.includes(code) ? "violet" : "neutral"}>{name}</Badge><Button size="sm" variant="ghost" aria-label={t.remove(name)} isDisabled={disabled} onPress={() => select(code, false)}>×</Button></li>;
    })}</ul>}
    <div className={styles.groups}>{visible.map(category => <fieldset className={styles.group} key={category.code} disabled={disabled}>
      <legend>{category.name}</legend>
      {category.specializations.map(item => {
        const selected = value.selectedCodes.includes(item.code);
        const isPrimary = value.primaryCodes.includes(item.code);
        return <div className={styles.option} key={item.code}>
          <Checkbox isSelected={selected} onChange={checked => select(item.code, checked)} isDisabled={disabled || (!selected && value.selectedCodes.length >= 5)}>{item.name}</Checkbox>
          {!filter && selected && <Checkbox aria-label={t.markPrimary(item.name)} isSelected={isPrimary} onChange={checked => primary(item.code, checked)} isDisabled={disabled || (!isPrimary && value.primaryCodes.length >= 3)}>{t.primary}</Checkbox>}
        </div>;
      })}
    </fieldset>)}</div>
    {!visible.length && <p role="status">{m.common.noResults}</p>}
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
