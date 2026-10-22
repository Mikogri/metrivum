import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAccountKey, useApi } from "~/shared/session/AccountScope";
import type { Schema } from "@trainflow/api-client-web";
import type { AnalysisContext, CheckInsData, ClientsData, FinanceData, Overview, TrainingData } from "./types";

export type AnalysisTab = "overview" | "finance" | "clients" | "checkins" | "training";
type TabResult =
  | { section: "overview"; data: Overview }
  | { section: "finance"; data: FinanceData }
  | { section: "clients"; data: ClientsData }
  | { section: "checkins"; data: CheckInsData }
  | { section: "training"; data: TrainingData };

export function useAnalysis(tab: AnalysisTab, params: Record<string, string | undefined>, enabled: boolean, teamId?: string) {
  const account = useAccountKey();
  const api = useApi();
  const client = useQueryClient();
  const metadataKey = [account, "coaching", "analyze", "/api/v1/analyze/context", teamId, params];
  const metadata = useQuery({
    queryKey: metadataKey,
    enabled: enabled && tab !== "overview",
    staleTime: 60_000,
    queryFn: async ({ signal }) => (await api<AnalysisContext>({ path: "/api/v1/analyze/context", query: params, signal })).data,
  });
  const query = useQuery<TabResult>({
    queryKey: [account, "coaching", "analyze", `/api/v1/analyze/${tab}`, teamId, params],
    enabled: enabled && (tab === "overview" || metadata.isSuccess),
    staleTime: 60_000,
    queryFn: async ({ signal }) => {
      const read = async <T,>(section: string, previous = false) => (await api<T>({
        path: `/api/v1/analyze/${section}`, signal,
        query: previous ? { ...params, from: metadata.data!.comparisonPeriod.from, to: metadata.data!.comparisonPeriod.to } : params,
      })).data;
      switch (tab) {
        case "overview": {
          const data = await read<Overview>("overview");
          if (!signal.aborted) client.setQueryData<AnalysisContext>(metadataKey, {
            period: data.period, comparisonPeriod: data.comparisonPeriod, filters: data.filters,
          });
          return { section: tab, data };
        }
        case "finance": {
          const [finance, previousFinance] = await Promise.all([read<Schema<"FinancialAnalysis">>("financial"), read<Schema<"FinancialAnalysis">>("financial", true)]);
          return { section: tab, data: { finance, previousFinance } };
        }
        case "clients": {
          const [clients, previousClients, acquisition] = await Promise.all([read<Schema<"ClientsAnalysis">>("clients"), read<Schema<"ClientsAnalysis">>("clients", true), read<Schema<"AcquisitionAnalysis">>("acquisition")]);
          return { section: tab, data: { clients, previousClients, acquisition } };
        }
        case "checkins": {
          const [checkIns, previousCheckIns, messaging] = await Promise.all([read<Schema<"CheckInsAnalysis">>("check-ins"), read<Schema<"CheckInsAnalysis">>("check-ins", true), read<Schema<"MessagingAnalysis">>("messaging")]);
          return { section: tab, data: { checkIns, previousCheckIns, messaging } };
        }
        case "training": return { section: tab, data: { training: await read<Schema<"TrainingAnalysis">>("training") } };
      }
    },
  });
  return { query, metadata: query.data?.section === "overview" ? query.data.data : metadata.data,
    error: tab !== "overview" && metadata.isError ? metadata.error : query.error,
    retry: () => tab !== "overview" && metadata.isError ? metadata.refetch() : query.refetch(),
  };
}
