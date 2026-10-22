import { useQuery } from "@tanstack/react-query";
import type { FormulaUse } from "@trainflow/api-client-web";
import { useDebounced } from "~/shared/lib/useDebounced";
import { useAccountKey, useApi } from "~/shared/session/AccountScope";
import { evaluateFormula } from "../../api";

export function useFormulaEvaluation(value: FormulaUse | null | undefined) {
  const api = useApi();
  const account = useAccountKey();
  const serialized = value ? JSON.stringify(value) : "";
  const debounced = useDebounced(serialized, 350);
  const query = useQuery({
    queryKey: [account, "training", "inline-formula", debounced],
    queryFn: ({ signal }) => {
      // The document retains source bindings; this endpoint previews already-resolved snapshot values.
      const body = { ...JSON.parse(debounced), variableBindings: null } as FormulaUse;
      return evaluateFormula(api, body, signal);
    },
    enabled: Boolean(debounced) && serialized === debounced,
    staleTime: 60_000,
    retry: false,
  });
  // A previous response must never be rendered for text or a snapshot that has changed.
  return { ...query, data: serialized === debounced ? query.data : undefined, error: serialized === debounced ? query.error : null };
}
