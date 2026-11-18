import {
  keepPreviousData,
  useQuery,
  type QueryClient,
} from "@tanstack/react-query";
import { useAccountKey, useApi } from "~/shared/session/AccountScope";
import { useLocale } from "~/shared/i18n/LocaleContext";
import {
  exerciseHistory,
  getDictionaries,
  getExercise,
  listExercises,
  listTags,
  type ExerciseSearch,
} from "./api";

export const exerciseKeys = {
  all: (a: string) => [a, "exercises"] as const,
  list: (a: string, q: ExerciseSearch) => [a, "exercises", "list", q] as const,
  detail: (a: string, id: string) => [a, "exercises", "detail", id] as const,
  history: (a: string, id: string) => [a, "exercises", "history", id] as const,
  tags: (a: string, search: string) =>
    [a, "exercises", "tags", search] as const,
  dictionaries: (a: string) => [a, "exercises", "dictionaries"] as const,
};

export function invalidateFavoriteQueries(
  cache: QueryClient,
  account: string,
  id: string,
) {
  return cache.invalidateQueries({
    queryKey: exerciseKeys.all(account),
    predicate: ({ queryKey }) =>
      queryKey[2] === "list" ||
      (queryKey[2] === "detail" && queryKey[3] === id),
  });
}

export function useExerciseList(q: ExerciseSearch, enabled = true) {
  const api = useApi();
  const a = useAccountKey();
  return useQuery({
    queryKey: exerciseKeys.list(a, q),
    queryFn: ({ signal }) => listExercises(api, q, signal),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useExercise(id: string | undefined) {
  const api = useApi();
  const a = useAccountKey();
  return useQuery({
    queryKey: exerciseKeys.detail(a, id ?? ""),
    queryFn: ({ signal }) => getExercise(api, id!, signal),
    enabled: Boolean(id),
  });
}

export function useExerciseHistory(id: string) {
  const api = useApi();
  const a = useAccountKey();
  return useQuery({
    queryKey: exerciseKeys.history(a, id),
    queryFn: ({ signal }) => exerciseHistory(api, id, 1, signal),
  });
}

export function useTags(search = "") {
  const api = useApi();
  const a = useAccountKey();
  return useQuery({
    queryKey: exerciseKeys.tags(a, search),
    queryFn: ({ signal }) => listTags(api, search || undefined, signal),
    staleTime: 60_000,
  });
}

export function useDictionaries() {
  const api = useApi();
  const a = useAccountKey();
  return useQuery({
    queryKey: exerciseKeys.dictionaries(a),
    queryFn: ({ signal }) => getDictionaries(api, signal),
    staleTime: 10 * 60_000,
  });
}

/** Label of a muscle / movement pattern key in the UI language. */
export function useDictionaryLabel() {
  const { data } = useDictionaries();
  const locale = useLocale();
  return (kind: "muscles" | "movementPatterns", key: string) => {
    const entry = data?.[kind].find((item) => item.key === key);
    if (!entry) return key;
    return locale === "pl" ? entry.labelPl : entry.labelEn;
  };
}
