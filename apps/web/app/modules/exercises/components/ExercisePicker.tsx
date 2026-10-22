import { Check } from "lucide-react";
import { useState } from "react";
import { ListBox, ListBoxItem } from "react-aria-components";
import type { ExerciseListItemDto } from "@trainflow/api-client-web";
import { Dialog, SearchInput, Spinner } from "@trainflow/ui-web";
import { useT } from "~/shared/i18n/AppLocale";
import { useDebounced } from "~/shared/lib/useDebounced";
import { useExerciseList } from "../queries";
import styles from "./ExercisePicker.module.css";

/**
 * Searchable catalog picker (domain component). Searches the API page by page instead of
 * loading the whole catalog into the browser.
 */
export function ExercisePicker({
  isOpen,
  onOpenChange,
  onPick,
  selectedId,
  title,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (exercise: ExerciseListItemDto) => void;
  selectedId?: string;
  title?: string;
}) {
  const m = useT();
  const [search, setSearch] = useState("");
  const debounced = useDebounced(search, 200);
  const list = useExerciseList({ search: debounced || undefined, pageSize: 30, sort: "name" }, isOpen);
  const items = list.data?.items ?? [];
  return (
    <Dialog isOpen={isOpen} onOpenChange={onOpenChange} title={title ?? m.editor.picker.title} size="md" closeLabel={m.common.close}>
      <div className={styles.body}>
        <SearchInput aria-label={m.editor.picker.search} placeholder={m.editor.picker.search} value={search} onChange={setSearch} autoFocus />
        <div className={styles.listWrap} aria-busy={list.isFetching} data-refreshing={list.isFetching && items.length > 0 ? "" : undefined}>
          {list.isFetching && items.length > 0 ? (
            <span className={styles.spinner}>
              <Spinner size="sm" />
            </span>
          ) : null}
          <ListBox
            aria-label={m.editor.picker.title}
            items={items}
            selectionMode="single"
            selectedKeys={selectedId ? [selectedId] : []}
            className={styles.list}
            renderEmptyState={() => list.isPending || list.isFetching ? (
              <div className={styles.loading} role="status"><Spinner size="md" /><span>{m.common.loading}</span></div>
            ) : <p className={styles.empty} role={list.isError ? "alert" : undefined}>{list.isError ? m.editor.picker.failed : debounced ? m.editor.picker.noMatch(debounced) : m.editor.picker.none}</p>}
            onAction={(key) => {
              const exercise = items.find((item) => item.id === key);
              if (exercise) {
                onPick(exercise);
                onOpenChange(false);
              }
            }}
          >
            {(item) => (
              <ListBoxItem id={item.id} textValue={item.name} className={styles.item}>
                {({ isSelected }) => (
                  <>
                    <span className={styles.text}>
                      <span className={styles.name}>{item.name}</span>
                      {item.description ? <span className={styles.description}>{item.description}</span> : null}
                    </span>
                    {isSelected ? <Check aria-hidden="true" className={styles.check} /> : null}
                  </>
                )}
              </ListBoxItem>
            )}
          </ListBox>
        </div>
      </div>
    </Dialog>
  );
}
