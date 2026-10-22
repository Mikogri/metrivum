import type { AnalysisComparison, AnalysisDto, AnalysisSetOptions, AnalysisWorkoutLink, AnalysisWorkoutLinkRequest, CoachAnalysis, AnalysisResult, CreateAnalysisRequest, MediaDto, MediaReadTicket, UpdateAnalysisRequest, UploadRequest, UploadTicket } from "@trainflow/api-client-web";
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

// Link to a logged set: the coach attaches the analysis to one set (or a whole workout) of a client.
export async function getWorkoutLink(api: Transport, analysisId: string, signal?: AbortSignal): Promise<AnalysisWorkoutLink | null> {
  const response = await api<AnalysisWorkoutLink | undefined>({ path: `/api/v1/analyses/${id(analysisId)}/workout-link`, signal });
  return response.data ?? null;
}

export async function linkWorkout(api: Transport, analysisId: string, body: AnalysisWorkoutLinkRequest, version: number) {
  return (await api<AnalysisWorkoutLink>({ method: "PUT", path: `/api/v1/analyses/${id(analysisId)}/workout-link`, json: body, ifMatch: version })).data;
}

export async function unlinkWorkout(api: Transport, analysisId: string, version: number) {
  await api({ method: "DELETE", path: `/api/v1/analyses/${id(analysisId)}/workout-link`, ifMatch: version, responseType: "none" });
}

export async function analysisSetOptions(api: Transport, q: { relationshipId?: string; days?: number }, signal?: AbortSignal) {
  return (await api<AnalysisSetOptions>({ path: "/api/v1/training/analysis-set-options", query: { relationshipId: q.relationshipId, days: q.days ?? 60 }, signal })).data;
}

// Analyses a coach shared with the signed-in client at their logged sets (read-only).
export async function listFromCoach(api: Transport, executionId?: string, signal?: AbortSignal) {
  return (await api<CoachAnalysis[]>({ path: "/api/v1/analyses/from-coach", query: { executionId }, signal })).data;
}

export async function getFromCoach(api: Transport, analysisId: string, signal?: AbortSignal) {
  return (await api<CoachAnalysis>({ path: `/api/v1/analyses/from-coach/${id(analysisId)}`, signal })).data;
}

export async function getFromCoachResult(api: Transport, analysisId: string, signal?: AbortSignal) {
  return (await api<AnalysisResult>({ path: `/api/v1/analyses/from-coach/${id(analysisId)}/result`, query: { maxPoints: 1000 }, signal })).data;
}

export async function fromCoachVideoUrl(api: Transport, analysisId: string) {
  return (await api<{ url: string; expiresAt: string }>({ method: "POST", path: `/api/v1/analyses/from-coach/${id(analysisId)}/video-url` })).data;
}

// Sharing: a read-only link per completed analysis (see AnalysisSharing on the API).
export interface AnalysisShare { token: string; createdAt: string; allowSave?: boolean }
export interface SharedAnalysis {
  name: string; configuration: AnalysisDto["configuration"]; createdAt: string; completedAt: string | null; hasVideo: boolean;
  sourceVideo?: AnalysisDto["sourceVideo"];
  /** The owner lets people keep it in their library (as a reference, never a copy). */
  allowSave?: boolean; saved?: boolean; own?: boolean; ownerName?: string | null;
}
/** A shared analysis kept in the viewer's library: opened through its link. */
export interface SavedAnalysis { token: string; analysisId: string; name: string; ownerName: string; createdAt: string; completedAt: string | null; savedAt: string; hasVideo: boolean }

export async function getShare(api: Transport, analysisId: string, signal?: AbortSignal): Promise<AnalysisShare | null> {
  const response = await api<AnalysisShare | undefined>({ path: `/api/v1/analyses/${id(analysisId)}/share`, signal });
  return response.data ?? null;
}

export async function createShare(api: Transport, analysisId: string, allowSave?: boolean) {
  return (await api<AnalysisShare>({ method: "POST", path: `/api/v1/analyses/${id(analysisId)}/share`, json: allowSave === undefined ? {} : { allowSave } })).data;
}

export async function saveShared(api: Transport, token: string) {
  await api({ method: "POST", path: `/api/v1/analyses/shared/${id(token)}/save`, responseType: "none" });
}

export async function unsaveShared(api: Transport, token: string) {
  await api({ method: "DELETE", path: `/api/v1/analyses/shared/${id(token)}/save`, responseType: "none" });
}

export async function listSaved(api: Transport, signal?: AbortSignal) {
  return (await api<SavedAnalysis[]>({ path: "/api/v1/analyses/saved", signal })).data;
}

export async function revokeShare(api: Transport, analysisId: string) {
  await api({ method: "DELETE", path: `/api/v1/analyses/${id(analysisId)}/share`, responseType: "none" });
}

export async function getShared(api: Transport, token: string, signal?: AbortSignal) {
  return (await api<SharedAnalysis>({ path: `/api/v1/analyses/shared/${id(token)}`, signal })).data;
}

export async function getSharedResult(api: Transport, token: string, signal?: AbortSignal) {
  return (await api<AnalysisResult>({ path: `/api/v1/analyses/shared/${id(token)}/result`, query: { maxPoints: 1000 }, signal })).data;
}

export async function sharedVideoUrl(api: Transport, token: string) {
  return (await api<{ url: string; expiresAt: string }>({ method: "POST", path: `/api/v1/analyses/shared/${id(token)}/video-url` })).data;
}

/** The link people open: inside the app, so the viewer signs in first. */
export function shareUrl(token: string) {
  return `${window.location.origin}/app/video-analyses/shared/${encodeURIComponent(token)}`;
}

// Media
export async function listMedia(api: Transport, q: { search?: string; state?: string; sort?: string; page?: number; pageSize?: number }, signal?: AbortSignal) {
  return (await api<MediaDto[]>({ path: "/api/v1/media", query: q, signal })).data;
}

export async function getMedia(api: Transport, mediaId: string, signal?: AbortSignal) {
  const response = await api<MediaDto>({ path: `/api/v1/media/${id(mediaId)}`, signal });
  return { data: response.data, version: response.version ?? response.data.version };
}

export async function reserveUpload(api: Transport, body: UploadRequest, signal?: AbortSignal) {
  return (await api<UploadTicket>({ method: "POST", path: "/api/v1/media/uploads", json: body, signal })).data;
}

export async function finalizeUpload(api: Transport, mediaId: string, signal?: AbortSignal) {
  return (await api<MediaDto>({ method: "POST", path: `/api/v1/media/${id(mediaId)}/finalize`, signal, timeoutMs: 60_000 })).data;
}

export async function readUrl(api: Transport, mediaId: string) {
  return (await api<MediaReadTicket>({ method: "POST", path: `/api/v1/media/${id(mediaId)}/read-url` })).data;
}

export async function deleteMedia(api: Transport, mediaId: string, version: number) {
  await api({ method: "DELETE", path: `/api/v1/media/${id(mediaId)}`, ifMatch: version, responseType: "none" });
}
