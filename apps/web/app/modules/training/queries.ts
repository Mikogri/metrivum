import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useAccountKey, useApi } from "~/shared/session/AccountScope";
import { getPlan, listBuiltInFormulas, listFolders, listFormulas, listPlans, listRevisions, type PlanListQuery } from "./api";

export const trainingKeys = {
  all: (a: string) => [a, "training"] as const,
  plans: (a: string) => [a, "training", "plans"] as const,
  planList: (a: string, q: PlanListQuery) => [a, "training", "plans", "list", q] as const,
  plan: (a: string, planId: string) => [a, "training", "plans", "detail", planId] as const,
  revisions: (a: string, planId: string) => [a, "training", "plans", "revisions", planId] as const,
  folders: (a: string) => [a, "training", "folders"] as const,
  folderChildren: (a: string, parentId: string | null) => [a, "training", "folders", parentId ?? "root"] as const,
  formulas: (a: string) => [a, "training", "formulas"] as const,
  formulaList: (a: string, search: string, page: number, pageSize = 20) => [a, "training", "formulas", "list", search, page, pageSize] as const,
  builtIns: (a: string) => [a, "training", "formulas", "built-in"] as const,
};

export function usePlanList(q: PlanListQuery, enabled = true) {
  const api = useApi();
  const a = useAccountKey();
  return useQuery({ queryKey: trainingKeys.planList(a, q), queryFn: ({ signal }) => listPlans(api, q, signal), placeholderData: keepPreviousData, enabled });
}

export function usePlan(planId: string | undefined) {
  const api = useApi();
  const a = useAccountKey();
  return useQuery({ queryKey: trainingKeys.plan(a, planId ?? ""), queryFn: ({ signal }) => getPlan(api, planId!, signal), enabled: Boolean(planId) });
}

export function useRevisions(planId: string) {
  const api = useApi();
  const a = useAccountKey();
  return useQuery({ queryKey: trainingKeys.revisions(a, planId), queryFn: ({ signal }) => listRevisions(api, planId, 1, signal) });
}

export function useFolderChildren(parentId: string | null, enabled = true) {
  const api = useApi();
  const a = useAccountKey();
  return useQuery({ queryKey: trainingKeys.folderChildren(a, parentId), queryFn: ({ signal }) => listFolders(api, parentId, 1, signal), enabled });
}

export function useFormulaList(search: string, page: number, pageSize = 20) {
  const api = useApi();
  const a = useAccountKey();
  return useQuery({ queryKey: trainingKeys.formulaList(a, search, page, pageSize), queryFn: ({ signal }) => listFormulas(api, search || undefined, page, signal, pageSize), placeholderData: keepPreviousData });
}

export function useBuiltInFormulas() {
  const api = useApi();
  const a = useAccountKey();
  return useQuery({ queryKey: trainingKeys.builtIns(a), queryFn: ({ signal }) => listBuiltInFormulas(api, signal), staleTime: 30 * 60_000 });
}
