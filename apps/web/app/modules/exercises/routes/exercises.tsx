import { Dumbbell, Plus, SearchX } from "lucide-react";
import { useEffect, useState } from "react";
import { Link as RouterLink, useSearchParams } from "react-router";
import { Button, Combobox, DataTable, EmptyState, ErrorState, LoadingState, Option, PageHeader, Pagination, SearchInput, Select, Switch, Toolbar } from "@trainflow/ui-web";
import { FeatureGate, LockedReason, RequireFeature, useFeatureAccess } from "~/shared/access";
import { formatRelative } from "~/shared/i18n/format";
import { useLocale } from "~/shared/i18n/LocaleContext";
import { useT } from "~/shared/i18n/AppLocale";
import { errorText, traceIdOf } from "~/shared/lib/errorText";
import { useDebounced } from "~/shared/lib/useDebounced";
import { pageFromParam, useUrlState } from "~/shared/lib/useUrlState";
import { LibraryViewToggle, useLibraryView } from "~/shared/library/LibraryViewToggle";
import { CreateExerciseDialog } from "../components/CreateExerciseDialog";
import { FavoriteButton } from "../components/FavoriteButton";
import { useDictionaries, useExerciseList, useTags } from "../queries";
import { GROUP_LABELS, exerciseGroup, muscleGroup } from "../muscleGroup";
import styles from "./exercises.module.css";
import { MuscleExplorer } from "~/modules/anatomy";
import { privateMeta } from "~/shared/i18n/site";

/** Rows per page in lists. */
const PAGE_SIZE = 20;

export const meta = () => privateMeta("Exercises — Metrivum");

const DEFAULTS = { q: "", tag: "", muscle: "", pattern: "", fav: "", sort: "name", page: "1", view: "list" };

function ExerciseLibrary() {
  const m = useT();
  const t = m.exercises;
  const locale = useLocale();
  const [state, update] = useUrlState(DEFAULTS);
  const view = useLibraryView(state.view);
  const pageSize = PAGE_SIZE;
  const [params] = useSearchParams();
  const [search, setSearch] = useState(state.q);
  const debounced = useDebounced(search, 300);
  const page = pageFromParam(state.page);
  const favAccess = useFeatureAccess("exercises.favorites");
  const createAccess = useFeatureAccess("exercises.create");
  const [createOpen, setCreateOpen] = useState(params.get("create") === "1");

  useEffect(() => {
    if (debounced !== state.q) update({ q: debounced });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  const query = {
    search: state.q || undefined,
    tagId: state.tag || undefined,
    muscleKey: state.muscle || undefined,
    movementPatternKey: state.pattern || undefined,
    favoritesOnly: state.fav === "1" && favAccess.allowed,
    sort: state.sort,
    page,
    pageSize,
  };
  const list = useExerciseList(query);
  const dictionaries = useDictionaries();
  const tags = useTags();
  const filtersActive = Boolean(state.q || state.tag || state.muscle || state.pattern || state.fav);
  const label = (entry: { labelEn: string; labelPl: string }) => (locale === "pl" ? entry.labelPl : entry.labelEn);
  const pageCount = list.data ? Math.max(1, Math.ceil(list.data.total / pageSize)) : null;
  const muscleName = (key: string) => {
    const entry = dictionaries.data?.muscles.find((d) => d.key === key);
    return entry ? label(entry) : key;
  };
  const groupLabels = GROUP_LABELS[locale === "pl" ? "pl" : "en"];

  return (
    <>
      <PageHeader
        title={t.title}
        description={t.description}
        actions={
          <LockedReason access={createAccess}>
            <Button variant="primary" iconStart={<Plus />} isDisabled={!createAccess.allowed} onPress={() => setCreateOpen(true)}>
              {t.add}
            </Button>
          </LockedReason>
        }
      />
      <MuscleExplorer muscleKey={state.muscle} onMuscleChange={key => update({ muscle: key || null })}>
      <Toolbar aria-label={m.common.search} className={styles.toolbar}>
        <SearchInput aria-label={t.searchLabel} placeholder={t.searchPlaceholder} value={search} onChange={setSearch} className={styles.search} />
        <Combobox
          aria-label={t.tag}
          placeholder={t.anyTag}
          menuTrigger="focus"
          selectedKey={state.tag || null}
          onSelectionChange={(key) => update({ tag: key === null || key === "__any" ? null : String(key) })}
          emptyState={m.common.noResults}
          className={styles.filter}
        >
          {[{ id: "__any", name: t.anyTag }, ...[...(tags.data ?? [])].sort((a, b) => a.name.localeCompare(b.name))].map((tag) => (
            <Option key={tag.id} id={tag.id} textValue={tag.name}>
              {tag.name}
            </Option>
          ))}
        </Combobox>
        <Combobox
          aria-label={t.muscle}
          placeholder={t.anyMuscle}
          menuTrigger="focus"
          selectedKey={state.muscle || null}
          onSelectionChange={(key) => update({ muscle: key === null || key === "__any" ? null : String(key) })}
          emptyState={m.common.noResults}
          className={styles.filter}
        >
          {[
            { key: "__any", text: t.anyMuscle },
            ...(dictionaries.data?.muscles ?? [])
              .filter((d) => d.isActive || d.key === state.muscle)
              .map((d) => ({ key: d.key, text: label(d) }))
              .sort((a, b) => a.text.localeCompare(b.text)),
          ].map((item) => (
            <Option key={item.key} id={item.key} textValue={item.text}>
              {item.text}
            </Option>
          ))}
        </Combobox>
        <Combobox
          aria-label={t.pattern}
          placeholder={t.anyPattern}
          menuTrigger="focus"
          selectedKey={state.pattern || null}
          onSelectionChange={(key) => update({ pattern: key === null || key === "__any" ? null : String(key) })}
          emptyState={m.common.noResults}
          className={styles.filter}
        >
          {[
            { key: "__any", text: t.anyPattern },
            ...(dictionaries.data?.movementPatterns ?? [])
              .filter((d) => d.isActive || d.key === state.pattern)
              .map((d) => ({ key: d.key, text: label(d) }))
              .sort((a, b) => a.text.localeCompare(b.text)),
          ].map((item) => (
            <Option key={item.key} id={item.key} textValue={item.text}>
              {item.text}
            </Option>
          ))}
        </Combobox>
        <Select aria-label={m.common.sortBy} selectedKey={state.sort} onSelectionChange={(key) => update({ sort: String(key) })} className={styles.filter}>
          {Object.entries(t.sort).map(([key, text]) => (
            <Option key={key} id={key}>
              {text}
            </Option>
          ))}
        </Select>
        <FeatureGate feature="exercises.favorites">
          <Switch isSelected={state.fav === "1"} onChange={(on) => update({ fav: on ? "1" : null })}>
            {t.favoritesOnly}
          </Switch>
        </FeatureGate>
        {filtersActive ? (
          <Button
            variant="ghost"
            size="sm"
            onPress={() => {
              setSearch("");
              update({ q: null, tag: null, muscle: null, pattern: null, fav: null });
            }}
          >
            {m.common.clearFilters}
          </Button>
        ) : null}
        <LibraryViewToggle value={view} onChange={(next) => update({ view: next, page: state.page })} />
      </Toolbar>

      {list.isPending ? (
        <LoadingState label={m.common.loading} />
      ) : list.isError ? (
        <ErrorState
          title={errorText(m, list.error)}
          reference={traceIdOf(list.error)}
          actions={
            <Button onPress={() => void list.refetch()} loading={list.isFetching}>
              {m.common.retry}
            </Button>
          }
        />
      ) : list.data.items.length === 0 ? (
        filtersActive ? (
          <EmptyState icon={<SearchX />} title={t.noResultsTitle} description={t.noResultsBody} />
        ) : (
          <EmptyState icon={<Dumbbell />} title={t.emptyTitle} description={t.emptyBody} />
        )
      ) : (
        <>
          <p className={styles.count} aria-live="polite">
            {t.results(list.data.total)}
          </p>
          {view === "cards" ? (
            <ul className={styles.cards} aria-label={t.title} data-stale={list.isPlaceholderData || undefined}>
              {list.data.items.map((exercise) => (
                <li key={exercise.id} className={styles.card}>
                  <div className={styles.cardTop}>
                    <span className={styles.cardIcon} data-group={exerciseGroup(exercise.primaryMuscleKeys) ?? undefined} aria-hidden="true"><Dumbbell /></span>
                    <FavoriteButton id={exercise.id} isFavorite={exercise.isFavorite} />
                  </div>
                  <RouterLink className={styles.cardTitle} to={`/app/exercises/${exercise.id}`}>{exercise.name}</RouterLink>
                  <div className={styles.chips}>
                    {exercise.primaryMuscleKeys.slice(0, 3).map((key) => (
                      <span key={key} className={styles.chip} data-group={muscleGroup(key) ?? undefined}>{muscleName(key)}</span>
                    ))}
                    {exercise.primaryMuscleKeys.length > 3 ? <span className={styles.more}>+{exercise.primaryMuscleKeys.length - 3}</span> : null}
                  </div>
                  {exercise.description ? <p className={styles.cardDescription}>{exercise.description}</p> : null}
                  <span className={styles.cardMeta}>{formatRelative(locale, exercise.createdAt)}</span>
                </li>
              ))}
            </ul>
          ) : <DataTable
            label={t.title}
            stale={list.isPlaceholderData}
            rows={list.data.items}
            rowKey={(exercise) => exercise.id}
            columns={[
              {
                id: "name",
                header: m.common.col.name,
                width: "30%",
                cell: (exercise) => {
                  const group = exerciseGroup(exercise.primaryMuscleKeys);
                  return (
                    <span className={styles.nameCell}>
                      <span className={styles.groupMark} data-group={group ?? undefined} title={group ? groupLabels[group] : undefined} aria-hidden="true" />
                      <RouterLink to={`/app/exercises/${exercise.id}`} data-row-link>
                        {exercise.name}
                      </RouterLink>
                    </span>
                  );
                },
              },
              {
                id: "muscles",
                header: t.detail.primaryMuscles,
                hideOnMobile: true,
                cell: (exercise) =>
                  exercise.primaryMuscleKeys.length ? (
                    <span className={styles.chips}>
                      {exercise.primaryMuscleKeys.slice(0, 3).map((key) => (
                        <span key={key} className={styles.chip} data-group={muscleGroup(key) ?? undefined}>
                          {muscleName(key)}
                        </span>
                      ))}
                      {exercise.primaryMuscleKeys.length > 3 ? <span className={styles.more}>+{exercise.primaryMuscleKeys.length - 3}</span> : null}
                    </span>
                  ) : (
                    <span className={styles.more}>—</span>
                  ),
              },
              { id: "created", header: m.common.col.created, width: "9rem", muted: true, hideOnMobile: true, cell: (exercise) => formatRelative(locale, exercise.createdAt) },
              {
                id: "favorite",
                header: <span className="tf-visually-hidden">{m.common.actions}</span>,
                width: "3.5rem",
                align: "end",
                cell: (exercise) => <FavoriteButton id={exercise.id} isFavorite={exercise.isFavorite} />,
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
      </MuscleExplorer>
      <CreateExerciseDialog isOpen={createOpen} onOpenChange={setCreateOpen} />
    </>
  );
}

export default function ExercisesRoute() {
  return (
    <RequireFeature feature="exercises.browse">
      <ExerciseLibrary />
    </RequireFeature>
  );
}
