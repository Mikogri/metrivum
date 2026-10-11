import type { AnalysisComparison, AnalysisDto, AnalysisResult, CreateAnalysisRequest, MediaDto, MediaReadTicket, UpdateAnalysisRequest, UploadRequest, UploadTicket } from "@trainflow/api-client-web";
import type { Transport } from "~/shared/http/transport";
import { requireLocalAnalyzer } from './local-analysis';

const id = (value: string) => encodeURIComponent(value);

export interface AnalysisListQuery {
  search?: string;
  status?: string;
  tag?: string;
  sort?: string;
  page?: number;
  pageSize?: number;
}

export async function listAnalyses(api: Transport, q: AnalysisListQuery, signal?: AbortSignal) {
  return (await api<AnalysisDto[]>({ path: "/api/v1/analyses", query: { search: q.search, status: q.status, tag: q.tag, sort: q.sort, page: q.page, pageSize: q.pageSize }, signal })).data;
}

export async function getAnalysis(api: Transport, analysisId: string, signal?: AbortSignal) {
  const response = await api<AnalysisDto>({ path: `/api/v1/analyses/${id(analysisId)}`, signal });
  return { data: response.data, version: response.version ?? response.data.version };
}

export async function createAnalysis(_api: Transport, _body: CreateAnalysisRequest, _idempotencyKey: string): Promise<AnalysisDto> {
  return requireLocalAnalyzer();
}

export async function updateAnalysis(api: Transport, analysisId: string, body: UpdateAnalysisRequest, version: number) {
  await api({ method: "PUT", path: `/api/v1/analyses/${id(analysisId)}`, json: body, ifMatch: version, responseType: "none" });
}

export async function cancelAnalysis(api: Transport, analysisId: string, version: number) {
  await api({ method: "POST", path: `/api/v1/analyses/${id(analysisId)}/cancel`, ifMatch: version, responseType: "none" });
}

export async function getResult(api: Transport, analysisId: string, options: { repetition?: number; maxPoints?: number } = {}, signal?: AbortSignal) {
  return (
    await api<AnalysisResult>({
      path: `/api/v1/analyses/${id(analysisId)}/result`,
      query: { repetition: options.repetition, maxPoints: options.maxPoints ?? 1000 },
      signal,
    })
  ).data;
}

export async function compareAnalyses(
  api: Transport,
  q: { leftId: string; rightId: string; leftRepetition?: number; rightRepetition?: number; maxPoints?: number },
  signal?: AbortSignal,
) {
  return (await api<AnalysisComparison>({ path: "/api/v1/analyses/compare", query: { ...q, maxPoints: q.maxPoints ?? 800 }, signal })).data;
}

// Media
export async function listMedia(api: Transport, q: { search?: string; state?: string; sort?: string; page?: number; pageSize?: number }, signal?: AbortSignal) {
  return (await api<MediaDto[]>({ path: "/api/v1/media", query: q, signal })).data;
}

export async function getMedia(api: Transport, mediaId: string, signal?: AbortSignal) {
  const response = await api<MediaDto>({ path: `/api/v1/media/${id(mediaId)}`, signal });
  return { data: response.data, version: response.version ?? response.data.version };
}

export async function reserveUpload(api: Transport, body: UploadRequest) {
  return (await api<UploadTicket>({ method: "POST", path: "/api/v1/media/uploads", json: body })).data;
}

export async function finalizeUpload(api: Transport, mediaId: string) {
  return (await api<MediaDto>({ method: "POST", path: `/api/v1/media/${id(mediaId)}/finalize`, timeoutMs: 60_000 })).data;
}

export async function readUrl(api: Transport, mediaId: string) {
  return (await api<MediaReadTicket>({ method: "POST", path: `/api/v1/media/${id(mediaId)}/read-url` })).data;
}

export async function deleteMedia(api: Transport, mediaId: string, version: number) {
  await api({ method: "DELETE", path: `/api/v1/media/${id(mediaId)}`, ifMatch: version, responseType: "none" });
}
