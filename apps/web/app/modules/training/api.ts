import type {
  BuiltInFormula,
  CommitImportRequest,
  CopyPlanRequest,
  CreatePlanRequest,
  DocumentKind,
  FolderDto,
  FolderRequest,
  FormulaDto,
  FormulaEvaluation,
  FormulaRequest,
  FormulaUse,
  ImportPreview,
  ImportValidation,
  PagedOfFolderDto,
  PagedOfFormulaListItem,
  PagedOfPlanListItem,
  PagedOfRevisionListItem,
  PlanDto,
  RevisionDto,
  SavePlanRequest,
} from "@metrivum/api-client-web";
import type { Transport } from "~/shared/http/transport";

import { storedDocument } from "./formula-values";

const base = "/api/v1/training";
const id = (value: string) => encodeURIComponent(value);

/** A response body together with the resource version from its ETag. */
export interface Versioned<T> {
  data: T;
  version: number;
}

function withVersion<T extends { version?: number }>(response: { data: T; version: number | null }): Versioned<T> {
  return { data: response.data, version: response.version ?? response.data.version ?? 0 };
}

export interface PlanListQuery {
  kind: DocumentKind;
  folderId?: string;
  /** Only plans outside every folder (top level of the library). */
  rootOnly?: boolean;
  search?: string;
  sort?: string;
  archived?: boolean;
  page?: number;
  pageSize?: number;
}

export async function listPlans(api: Transport, q: PlanListQuery, signal?: AbortSignal) {
  const { data } = await api<PagedOfPlanListItem>({
    path: `${base}/programs`,
    query: { kind: q.kind, folderId: q.folderId, rootOnly: q.rootOnly ? true : undefined, search: q.search, sort: q.sort, archived: q.archived ? true : undefined, page: q.page, pageSize: q.pageSize },
    signal,
  });
  return data;
}

export async function getPlan(api: Transport, planId: string, signal?: AbortSignal) {
  return withVersion(await api<PlanDto>({ path: `${base}/programs/${id(planId)}`, signal }));
}

export async function createPlan(api: Transport, body: CreatePlanRequest) {
  return withVersion(await api<PlanDto>({ method: "POST", path: `${base}/programs`, json: { ...body, document: storedDocument(body.document) } }));
}

export async function saveDraft(api: Transport, planId: string, body: SavePlanRequest, version: number, signal?: AbortSignal) {
  return withVersion(await api<PlanDto>({ method: "PUT", path: `${base}/programs/${id(planId)}/draft`, json: { ...body, document: storedDocument(body.document) }, ifMatch: version, signal, timeoutMs: 30_000 }));
}

export async function copyPlan(api: Transport, planId: string, body: CopyPlanRequest) {
  return withVersion(await api<PlanDto>({ method: "POST", path: `${base}/programs/${id(planId)}/copy`, json: body }));
}

export async function setArchived(api: Transport, planId: string, archived: boolean, version: number) {
  return withVersion(await api<PlanDto>({ method: "PUT", path: `${base}/programs/${id(planId)}/archive`, json: { archived }, ifMatch: version }));
}

export async function publishRevision(api: Transport, planId: string, version: number, idempotencyKey: string) {
  return (await api<RevisionDto>({ method: "POST", path: `${base}/programs/${id(planId)}/apply`, ifMatch: version, idempotencyKey })).data;
}

export async function listRevisions(api: Transport, planId: string, page = 1, signal?: AbortSignal) {
  return (await api<PagedOfRevisionListItem>({ path: `${base}/programs/${id(planId)}/revisions`, query: { page, pageSize: 25 }, signal })).data;
}

export async function getRevision(api: Transport, planId: string, number: number, signal?: AbortSignal) {
  return (await api<RevisionDto>({ path: `${base}/programs/${id(planId)}/revisions/${number}`, signal })).data;
}

export type ExportScope = "program" | "block" | "cycle" | "workout";

/** Exports an applied revision, or the current draft when `number` is "draft" (works even with problems in it). */
export async function exportRevision(
  api: Transport,
  planId: string,
  number: number | "draft",
  options: { format: "csv" | "pdf"; scope: ExportScope; scopeId?: string; delimiter?: "comma" | "semicolon" | "tab" },
  signal?: AbortSignal,
) {
  const delimiter = options.delimiter === "semicolon" ? ";" : options.delimiter === "tab" ? "\t" : undefined;
  const { data } = await api<Blob>({
    path: number === "draft" ? `${base}/programs/${id(planId)}/draft/export` : `${base}/programs/${id(planId)}/revisions/${number}/export`,
    query: {
      format: options.format,
      scope: options.scope === "program" ? undefined : options.scope,
      scopeId: options.scope === "program" ? undefined : options.scopeId,
      delimiter: options.format === "csv" ? delimiter : undefined,
    },
    responseType: "blob",
    signal,
    timeoutMs: 60_000,
  });
  return data;
}

// Folders
export async function listFolders(api: Transport, parentId: string | null, page = 1, signal?: AbortSignal) {
  return (await api<PagedOfFolderDto>({ path: `${base}/folders`, query: { parentId: parentId ?? undefined, page, pageSize: 100 }, signal })).data;
}

export async function createFolder(api: Transport, body: FolderRequest) {
  return withVersion(await api<FolderDto>({ method: "POST", path: `${base}/folders`, json: body }));
}

export async function updateFolder(api: Transport, folderId: string, body: FolderRequest, version: number) {
  return withVersion(await api<FolderDto>({ method: "PUT", path: `${base}/folders/${id(folderId)}`, json: body, ifMatch: version }));
}

export async function deleteFolder(api: Transport, folderId: string, version: number) {
  await api({ method: "DELETE", path: `${base}/folders/${id(folderId)}`, ifMatch: version, responseType: "none" });
}

// Formulas
export async function listFormulas(api: Transport, search: string | undefined, page = 1, signal?: AbortSignal, pageSize = 20) {
  return (await api<PagedOfFormulaListItem>({ path: `${base}/formulas`, query: { search, page, pageSize }, signal })).data;
}

export async function listBuiltInFormulas(api: Transport, signal?: AbortSignal) {
  return (await api<BuiltInFormula[]>({ path: `${base}/formulas/built-in`, signal })).data;
}

export async function getFormula(api: Transport, formulaId: string, version?: number, signal?: AbortSignal) {
  return withVersion(await api<FormulaDto>({ path: `${base}/formulas/${id(formulaId)}`, query: { version }, signal }));
}

export async function createFormula(api: Transport, body: FormulaRequest) {
  return withVersion(await api<FormulaDto>({ method: "POST", path: `${base}/formulas`, json: body }));
}

export async function updateFormula(api: Transport, formulaId: string, body: FormulaRequest, version: number) {
  return withVersion(await api<FormulaDto>({ method: "PUT", path: `${base}/formulas/${id(formulaId)}`, json: body, ifMatch: version }));
}

export async function copyFormula(api: Transport, formulaId: string, name: string) {
  return withVersion(await api<FormulaDto>({ method: "POST", path: `${base}/formulas/${id(formulaId)}/copy`, json: { name } }));
}

export async function evaluateFormula(api: Transport, body: FormulaUse, signal?: AbortSignal) {
  return (await api<FormulaEvaluation>({ method: "POST", path: `${base}/formulas/evaluate`, json: body, signal })).data;
}

// CSV import
export async function startImport(api: Transport, csv: string, delimiter: "comma" | "semicolon" | "tab") {
  const value = delimiter === "semicolon" ? ";" : delimiter === "tab" ? "\t" : undefined;
  return withVersion(
    await api<ImportPreview>({
      method: "POST",
      path: `${base}/imports/csv`,
      query: { delimiter: value },
      raw: { body: csv, contentType: "text/csv; charset=utf-8" },
      timeoutMs: 60_000,
    }),
  );
}

export async function getImport(api: Transport, importId: string, page = 1, signal?: AbortSignal) {
  return withVersion(await api<ImportPreview>({ path: `${base}/imports/${id(importId)}`, query: { page, pageSize: 100 }, signal }));
}

export async function mapImport(api: Transport, importId: string, exercises: Record<string, string>, version: number) {
  return withVersion(await api<ImportPreview>({ method: "PUT", path: `${base}/imports/${id(importId)}/mapping`, json: { exercises }, ifMatch: version }));
}

export async function validateImport(api: Transport, importId: string) {
  return (await api<ImportValidation>({ method: "POST", path: `${base}/imports/${id(importId)}/validate` })).data;
}

export async function commitImport(api: Transport, importId: string, body: CommitImportRequest, version: number, idempotencyKey: string) {
  return withVersion(
    await api<PlanDto>({ method: "POST", path: `${base}/imports/${id(importId)}/commit`, json: body, ifMatch: version, idempotencyKey }),
  );
}

export async function deletePlan(api: Transport, planId: string, version: number) {
  await api({ method: "DELETE", path: `${base}/programs/${id(planId)}`, ifMatch: version });
}
