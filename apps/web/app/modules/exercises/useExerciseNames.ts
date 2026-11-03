import { useQueries } from "@tanstack/react-query";
import { useMemo } from "react";
import { useAccountKey, useApi } from "~/shared/session/AccountScope";
import { getExercise } from "./api";
import { exerciseKeys } from "./queries";

export interface ExerciseLabel {
  name: string | null;
  isArchived: boolean;
  loading: boolean;
  missing: boolean;
  /** Taxonomy for volume summaries (empty until loaded). */
  movementPatternKeys: string[];
  primaryMuscleKeys: string[];
  secondaryMuscleKeys: string[];
}

// Exercises just picked from a list: their name shows at once, before the detail request comes back.
const picked = new Map<string, { name: string; primaryMuscleKeys: string[] }>();

/** Call with the list item right before putting a picked exercise into a plan. */
export function rememberPickedExercise(item: { id: string; name: string; primaryMuscleKeys?: string[] | null }) {
  picked.set(item.id, { name: item.name, primaryMuscleKeys: item.primaryMuscleKeys ?? [] });
}

/**
 * Names for catalog IDs used in a document. The API has no bulk lookup (see api-gaps.md),
 * so each distinct ID is fetched once and cached for the session.
 */
export function useExerciseNames(ids: string[]): Map<string, ExerciseLabel> {
  const api = useApi();
  const a = useAccountKey();
  const unique = useMemo(() => [...new Set(ids)].sort(), [ids]);
  const results = useQueries({
    queries: unique.map((id) => ({
      queryKey: exerciseKeys.detail(a, id),
      queryFn: ({ signal }: { signal: AbortSignal }) => getExercise(api, id, signal),
      staleTime: 10 * 60_000,
      retry: false,
    })),
  });
  return useMemo(() => {
    const map = new Map<string, ExerciseLabel>();
    unique.forEach((id, index) => {
      const result = results[index];
      const known = result?.data ? undefined : picked.get(id);
      map.set(id, {
        name: result?.data?.name ?? known?.name ?? null,
        isArchived: result?.data?.isArchived ?? false,
        loading: known ? false : result?.isPending ?? true,
        missing: result?.isError ?? false,
        movementPatternKeys: result?.data?.movementPatternKeys ?? [],
        primaryMuscleKeys: result?.data?.primaryMuscleKeys ?? known?.primaryMuscleKeys ?? [],
        secondaryMuscleKeys: result?.data?.secondaryMuscleKeys ?? [],
      });
    });
    return map;
    // results identity changes each render; depend on their data timestamps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unique, results.map((r) => r.dataUpdatedAt + ":" + r.errorUpdatedAt).join("|")]);
}
