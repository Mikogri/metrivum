import {
  keepPreviousData,
  queryOptions,
  useQuery,
} from "@tanstack/react-query";
import type { Transport } from "~/shared/http/transport";
import type { FormulaDto } from "@metrivum/api-client-web";
import { useAccountKey, useApi } from "~/shared/session/AccountScope";
import {
  getFormula,
  getPlan,
  listBuiltInFormulas,
  listFolders,
  listFormulas,
  listPlans,
  listRevisions,
  type PlanListQuery,
} from "./api";

export const trainingKeys = {
  all: (a: string) => [a, "training"] as const,
  plans: (a: string) => [a, "training", "plans"] as const,
  planList: (a: string, q: PlanListQuery) =>
    [a, "training", "plans", "list", q] as const,
  plan: (a: string, planId: string) =>
    [a, "training", "plans", "detail", planId] as const,
  revisions: (a: string, planId: string) =>
    [a, "training", "plans", "revisions", planId] as const,
  folders: (a: string) => [a, "training", "folders"] as const,
  folderChildren: (a: string, parentId: string | null) =>
    [a, "training", "folders", parentId ?? "root"] as const,
  formulas: (a: string) => [a, "training", "formulas"] as const,
  formulaList: (
    a: string,
    search: string,
    page: number,
    pageSize = 20,
    includeDefinitions = false,
  ) =>
    [
      a,
      "training",
      "formulas",
      "list",
      search,
      page,
      pageSize,
      includeDefinitions,
    ] as const,
  formula: (a: string, id: string, version: number) =>
    [a, "training", "formulas", "detail", id, version] as const,
  builtIns: (a: string) => [a, "training", "formulas", "built-in"] as const,
};

export function formulaQueryOptions(
  api: Transport,
  account: string,
  formula: Pick<FormulaDto, "id" | "version"> | FormulaDto,
) {
  return queryOptions({
    queryKey: trainingKeys.formula(account, formula.id, formula.version),
    queryFn: ({ signal }) =>
      getFormula(api, formula.id, formula.version, signal),
    initialData:
      "definition" in formula && formula.definition
        ? { data: formula, version: formula.version }
        : undefined,
    staleTime: 5 * 60_000,
  });
}

export function usePlanList(q: PlanListQuery, enabled = true) {
  const api = useApi();
  const a = useAccountKey();
  return useQuery({
    queryKey: trainingKeys.planList(a, q),
    queryFn: ({ signal }) => listPlans(api, q, signal),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function usePlan(planId: string | undefined) {
  const api = useApi();
  const a = useAccountKey();
  return useQuery({
    queryKey: trainingKeys.plan(a, planId ?? ""),
    queryFn: ({ signal }) => getPlan(api, planId!, signal),
    enabled: Boolean(planId),
  });
}

export function useRevisions(planId: string) {
  const api = useApi();
  const a = useAccountKey();
  return useQuery({
    queryKey: trainingKeys.revisions(a, planId),
    queryFn: ({ signal }) => listRevisions(api, planId, 1, signal),
  });
}

export function useFolderChildren(parentId: string | null, enabled = true) {
  const api = useApi();
  const a = useAccountKey();
  return useQuery({
    queryKey: trainingKeys.folderChildren(a, parentId),
    queryFn: ({ signal }) => listFolders(api, parentId, 1, signal),
    enabled,
  });
}

export function useFormulaList(
  search: string,
  page: number,
  pageSize = 20,
  includeDefinitions = false,
) {
  const api = useApi();
  const a = useAccountKey();
  return useQuery({
    queryKey: trainingKeys.formulaList(
      a,
      search,
      page,
      pageSize,
      includeDefinitions,
    ),
    queryFn: ({ signal }) =>
      listFormulas(
        api,
        search || undefined,
        page,
        signal,
        pageSize,
        includeDefinitions,
      ),
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey.at(-1) === includeDefinitions
        ? previous
        : undefined,
  });
}

export function useBuiltInFormulas() {
  const api = useApi();
  const a = useAccountKey();
  return useQuery({
    queryKey: trainingKeys.builtIns(a),
    queryFn: ({ signal }) => listBuiltInFormulas(api, signal),
    staleTime: 30 * 60_000,
  });
}
