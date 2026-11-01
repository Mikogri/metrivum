import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, FunctionSquare, Pencil, Plus } from "lucide-react";
import { FormulaMark } from "../components/FormulaMark";
import { useEffect, useState } from "react";
import type { FormulaListItem, Quantity, Unit } from "@metrivum/api-client-web";
import { Badge, Button, Card, DataTable, Dialog, EmptyState, ErrorState, IconButton, LoadingState, NumberInput, PageHeader, Pagination, SearchInput, Skeleton, toast } from "@metrivum/ui-web";
import { LockedArea, LockedReason, RequireFeature, useFeatureAccess } from "~/shared/access";
import { useLocale } from "~/shared/i18n/LocaleContext";
import { useT } from "~/shared/i18n/AppLocale";
import { errorText, traceIdOf } from "~/shared/lib/errorText";
import { useDebounced } from "~/shared/lib/useDebounced";
import { useErrorToast } from "~/shared/lib/useErrorToast";
import { pageFromParam, useUrlState } from "~/shared/lib/useUrlState";
import { useAccountKey, useApi } from "~/shared/session/AccountScope";
import { copyFormula, evaluateFormula } from "../api";
import { formatQuantity } from "../editor/model/notation";
import { formulaQueryOptions, trainingKeys, useBuiltInFormulas, useFormulaList } from "../queries";
import { FormulaDialog } from "../components/FormulaDialog";
import styles from "./formulas.module.css";
import { privateMeta } from "~/shared/i18n/site";
import { LibraryViewToggle, useLibraryView } from "~/shared/library/LibraryViewToggle";

/** Rows per page in lists. */
const PAGE_SIZE = 20;

export const meta = () => privateMeta("Formulas — Metrivum");



function TryFormula({ binding, inputs }: { binding: { builtIn: string | null; formulaId: string | null; version: number }; inputs: Record<string, Unit> }) {
  const m = useT();
  const t = m.training.formulas;
  const locale = useLocale();
  const api = useApi();
  const [values, setValues] = useState<Record<string, number>>({});
  const evaluate = useMutation({
    mutationFn: () =>
      evaluateFormula(api, {
        ...binding,
        inputs: Object.fromEntries(Object.entries(inputs).filter(([name]) => Number.isFinite(values[name])).map(([name, unit]) => [name, { value: values[name]!, unit } satisfies Quantity])),
      }),
  });
  return (
    <div className={styles.try}>
      <p className={styles.tryTitle}>{t.try}</p>
      <p className={styles.muted}>{t.tryBody}</p>
      <div className={styles.tryInputs}>
        {Object.entries(inputs).map(([name, unit]) => (
          <NumberInput placeholder={m.common.ph.number} key={name} label={name} size="sm" unit={m.editor.units[unit] || undefined} value={values[name] ?? NaN} onChange={(value) => setValues((v) => ({ ...v, [name]: value }))} />
        ))}
      </div>
      <div className={styles.tryRow}>
        <Button size="sm" onPress={() => evaluate.mutate()} loading={evaluate.isPending}>
          {t.evaluate}
        </Button>
        {evaluate.data ? (
          <span className={styles.result} aria-live="polite">
            {t.result}: <strong>{formatQuantity(locale, evaluate.data.result)}</strong>
          </span>
        ) : null}
        {evaluate.error ? <span className={styles.error}>{errorText(m, evaluate.error)}</span> : null}
      </div>
    </div>
  );
}


function Formulas() {
  const m = useT();
  const t = m.training.formulas;
  const api = useApi();
  const a = useAccountKey();
  const queryClient = useQueryClient();
  const showError = useErrorToast();
  const custom = useFeatureAccess("training.formulas.custom");
  const [state, update] = useUrlState({ q: "", page: "1", view: "list" });
  const view = useLibraryView(state.view);
  const [search, setSearch] = useState(state.q);
  const debounced = useDebounced(search, 300);
  const page = pageFromParam(state.page);
  useEffect(() => {
    if (debounced !== state.q) update({ q: debounced });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);
  const builtIns = useBuiltInFormulas();
  const pageSize = PAGE_SIZE;
  const list = useFormulaList(state.q, page, pageSize);
  const [editing, setEditing] = useState<FormulaListItem | "new" | null>(null);
  const [trying, setTrying] = useState<{ id: string; inputs: Record<string, Unit>; version: number } | null>(null);
  const copy = useMutation({
    mutationFn: (formula: FormulaListItem) => copyFormula(api, formula.id, t.copyName(formula.name)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: trainingKeys.formulas(a) });
      toast({ tone: "success", title: t.copied });
    },
    onError: (error) => showError(error),
  });
  const pageCount = list.data ? Math.max(1, Math.ceil(list.data.total / pageSize)) : null;

  return (
    <>
      {/* Without custom formulas the whole screen sits behind the Pro notice. */}
      <LockedArea variant="page" locked={!custom.pending && !custom.allowed} title={t.lockedTitle} body={t.lockedBody} points={t.lockedPoints}>
      <PageHeader
        title={t.title}
        description={t.description}
        actions={
          <LockedReason access={custom}>
            <Button variant="primary" iconStart={<Plus />} isDisabled={!custom.allowed} onPress={() => setEditing("new")}>
              {t.new}
            </Button>
          </LockedReason>
        }
      />
      <section aria-labelledby="builtin-title" className={styles.section}>
        <h2 id="builtin-title" className={styles.sectionTitle}>
          {t.builtIn}
        </h2>
        {builtIns.isPending ? (
          <Skeleton height="6rem" radius="lg" />
        ) : builtIns.isError ? (
          <ErrorState title={errorText(m, builtIns.error)} />
        ) : (
          <div className={styles.builtIns}>
            {builtIns.data.map((formula, i) => (
              <Card key={formula.key} padding="md" className={styles.builtIn} style={{ "--i": i } as React.CSSProperties}>
                <div className={styles.builtInHead}>
                  <FormulaMark size="lg" tone="accent" />
                  <h3>{t.builtInNames[formula.key ?? ""] ?? formula.key}</h3>
                  <Badge size="sm">{t.versionLabel(formula.version)}</Badge>
                </div>
                <code className={styles.expression}>{formula.definition.expression}</code>
                <p className={styles.muted}>
                  {Object.entries(formula.definition.inputs)
                    .map(([name, unit]) => `${name} (${m.editor.units[unit] || unit})`)
                    .join(", ")}
                </p>
                <TryFormula binding={{ builtIn: formula.key, formulaId: null, version: formula.version }} inputs={formula.definition.inputs} />
              </Card>
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="custom-title" className={styles.section}>
        <div className={styles.sectionHead}>
          <h2 id="custom-title" className={styles.sectionTitle}>
            {t.custom}
          </h2>
          <SearchInput aria-label={t.searchLabel} placeholder={m.common.search} value={search} onChange={setSearch} size="sm" className={styles.search} />
          <LibraryViewToggle value={view === "cards" ? "cards" : "list"} onChange={(view) => update({ view })} />
        </div>
        {list.isPending ? (
          <LoadingState label={m.common.loading} />
        ) : list.isError ? (
          <ErrorState title={errorText(m, list.error)} reference={traceIdOf(list.error)} actions={<Button onPress={() => void list.refetch()}>{m.common.retry}</Button>} />
        ) : list.data.items.length === 0 ? (
          <EmptyState icon={<FunctionSquare />} title={t.emptyTitle} description={t.emptyBody} />
        ) : (
          <>
            {view === "cards" ? (
              <ul className={styles.formulaGrid} aria-label={t.title}>
                {list.data.items.map((formula) => (
                  <FormulaCard
                    key={formula.id}
                    formula={formula}
                    canEdit={custom.allowed}
                    onEdit={() => setEditing(formula)}
                    onCopy={() => copy.mutate(formula)}
                    onTry={(inputs, version) => setTrying({ id: formula.id, inputs, version })}
                  />
                ))}
              </ul>
            ) : <DataTable
              label={t.title}
              rows={list.data.items}
              rowKey={(formula) => formula.id}
              columns={[
                {
                  id: "name",
                  header: m.common.col.name,
                  cell: (formula) => (
                    <span className={styles.nameCell}>
                      <FormulaMark />
                      {formula.name}
                      {formula.archived ? (
                        <Badge size="sm" tone="warning">
                          {t.archivedBadge}
                        </Badge>
                      ) : null}
                    </span>
                  ),
                },
                { id: "version", header: m.common.col.version, width: "8rem", muted: true, hideOnMobile: true, cell: (formula) => t.versionLabel(formula.version) },
                {
                  id: "actions",
                  header: <span className="tf-visually-hidden">{m.common.actions}</span>,
                  width: "11rem",
                  align: "end",
                  cell: (formula) => (
                    <span className={styles.rowActions}>
                      <Button
                        size="sm"
                        variant="ghost"
                        onPress={async () => {
                          const full = await queryClient.fetchQuery(formulaQueryOptions(api, a, formula)).catch((error) => {
                            showError(error);
                            return null;
                          });
                          if (full) setTrying({ id: formula.id, inputs: full.data.definition.inputs, version: full.data.version });
                        }}
                      >
                        {t.try}
                      </Button>
                      <IconButton label={m.common.edit} icon={<Pencil />} size="sm" isDisabled={!custom.allowed} onPress={() => setEditing(formula)} />
                      <IconButton label={m.common.duplicate} icon={<Copy />} size="sm" isDisabled={!custom.allowed} onPress={() => copy.mutate(formula)} />
                    </span>
                  ),
                },
              ]}
            />}
            <Pagination
              page={page}
              pageCount={pageCount}
              onPageChange={(next) => update({ page: String(next) }, { replace: false })}
              pageSize={pageSize}
            labels={{ previous: m.common.previous, next: m.common.next, status: m.common.pageStatus, navigation: m.common.pagination, pageSize: m.common.perPage }}
            />
          </>
        )}
      </section>
      </LockedArea>
      <FormulaDialog key={editing === "new" ? "new" : editing?.id ?? "closed"} formula={editing} onClose={() => setEditing(null)} />
      <Dialog isOpen={trying !== null} onOpenChange={(open) => !open && setTrying(null)} title={t.try} size="sm" closeLabel={m.common.close}>
        {trying ? <TryFormula binding={{ builtIn: null, formulaId: trying.id, version: trying.version }} inputs={trying.inputs} /> : null}
      </Dialog>
    </>
  );
}

export default function FormulasRoute() {
  return (
    <RequireFeature feature="training.programs.read">
      <Formulas />
    </RequireFeature>
  );
}

/** A compact formula card: expression and inputs up front, actions in the foot. */
function FormulaCard({ formula, canEdit, onEdit, onCopy, onTry }: { formula: FormulaListItem; canEdit: boolean; onEdit: () => void; onCopy: () => void; onTry: (inputs: Record<string, Unit>, version: number) => void }) {
  const m = useT();
  const t = m.training.formulas;
  const api = useApi();
  const a = useAccountKey();
  const full = useQuery(formulaQueryOptions(api, a, formula));
  const definition = full.data?.data.definition;
  return (
    <li className={styles.formulaCard}>
      <header className={styles.formulaCardHead}>
        <FormulaMark size="lg" />
        <h3>{formula.name}</h3>
        {formula.archived ? <Badge size="sm" tone="warning">{t.archivedBadge}</Badge> : <Badge size="sm">{t.versionLabel(formula.version)}</Badge>}
      </header>
      {definition ? <code className={styles.expression}>{definition.expression}</code> : <Skeleton height="1.75rem" radius="md" />}
      <div className={styles.inputChips}>
        {definition ? Object.entries(definition.inputs).map(([name, unit]) => (
          <span key={name} className={styles.inputChip}>{name}<small>{m.editor.units[unit] || unit}</small></span>
        )) : null}
      </div>
      <footer className={styles.formulaCardFoot}>
        <Button size="sm" variant="ghost" isDisabled={!definition} onPress={() => definition && onTry(definition.inputs, Number(full.data!.version))}>{t.try}</Button>
        <span className={styles.spacer} />
        <IconButton label={m.common.edit} icon={<Pencil />} size="sm" isDisabled={!canEdit} onPress={onEdit} />
        <IconButton label={m.common.duplicate} icon={<Copy />} size="sm" isDisabled={!canEdit} onPress={onCopy} />
      </footer>
    </li>
  );
}
