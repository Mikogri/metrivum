import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useAccountKey, useApi } from "~/shared/session/AccountScope";
import {
  getAnalysis,
  getResult,
  listAnalyses,
  listMedia,
  type AnalysisListQuery,
} from "./api";

export const videoKeys = {
  all: (a: string) => [a, "video"] as const,
  analyses: (a: string, q: AnalysisListQuery) =>
    [a, "video", "analyses", q] as const,
  analysis: (a: string, analysisId: string) =>
    [a, "video", "analysis", analysisId] as const,
  result: (a: string, analysisId: string, repetition?: number) =>
    [a, "video", "result", analysisId, repetition ?? "all"] as const,
  media: (a: string, q: object) => [a, "video", "media", q] as const,
};

export function useAnalysisList(q: AnalysisListQuery, enabled = true) {
  const api = useApi();
  const a = useAccountKey();
  return useQuery({
    queryKey: videoKeys.analyses(a, q),
    queryFn: ({ signal }) => listAnalyses(api, q, signal),
    placeholderData: keepPreviousData,
    enabled,
  });
}

const ACTIVE = new Set(["Queued", "Processing"]);

/**
 * Polls while a job is queued or processing, backing off from 2 s to 30 s.
 * Polling pauses in background tabs (TanStack default) and resumes after a refresh.
 */
export function useAnalysis(analysisId: string) {
  const api = useApi();
  const a = useAccountKey();
  return useQuery({
    queryKey: videoKeys.analysis(a, analysisId),
    queryFn: ({ signal }) => getAnalysis(api, analysisId, signal),
    refetchInterval: (query) => {
      const status = query.state.data?.data.status;
      if (!status || !ACTIVE.has(status)) return false;
      const polls = query.state.dataUpdateCount;
      return Math.min(30_000, 2_000 * Math.pow(1.5, Math.min(polls, 8)));
    },
    refetchIntervalInBackground: false,
  });
}

export function useAnalysisResult(
  analysisId: string,
  enabled: boolean,
  repetition?: number,
) {
  const api = useApi();
  const a = useAccountKey();
  return useQuery({
    queryKey: videoKeys.result(a, analysisId, repetition),
    queryFn: ({ signal }) =>
      getResult(api, analysisId, { repetition, maxPoints: 1000 }, signal),
    enabled,
    staleTime: Infinity,
  });
}

export function useMediaList(q: {
  search?: string;
  state?: string;
  sort?: string;
  page?: number;
  pageSize?: number;
}) {
  const api = useApi();
  const a = useAccountKey();
  return useQuery({
    queryKey: videoKeys.media(a, q),
    queryFn: ({ signal }) => listMedia(api, q, signal),
    placeholderData: keepPreviousData,
  });
}
