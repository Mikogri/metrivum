import type {
  CatalogPage,
  CreateExerciseRequest,
  DictionariesDto,
  ExerciseDto,
  ExerciseRevisionDto,
  TagDto,
} from "@metrivum/api-client-web";
import type { Transport } from "~/shared/http/transport";

export interface ExerciseSearch {
  search?: string;
  tagId?: string;
  muscleKey?: string;
  movementPatternKey?: string;
  favoritesOnly?: boolean;
  sort?: string;
  page?: number;
  pageSize?: number;
}

export async function listExercises(
  api: Transport,
  q: ExerciseSearch,
  signal?: AbortSignal,
) {
  const { data } = await api<CatalogPage>({
    path: "/api/v1/exercises",
    query: {
      Search: q.search,
      TagId: q.tagId,
      MuscleKey: q.muscleKey,
      MovementPatternKey: q.movementPatternKey,
      FavoritesOnly: q.favoritesOnly ? true : undefined,
      Sort: q.sort,
      Page: q.page,
      PageSize: q.pageSize,
    },
    signal,
  });
  return data;
}

export async function getExercise(
  api: Transport,
  id: string,
  signal?: AbortSignal,
) {
  return (
    await api<ExerciseDto>({
      path: `/api/v1/exercises/${encodeURIComponent(id)}`,
      signal,
    })
  ).data;
}

export async function createExercise(
  api: Transport,
  body: CreateExerciseRequest,
) {
  return (
    await api<ExerciseDto>({
      method: "POST",
      path: "/api/v1/exercises",
      json: body,
    })
  ).data;
}

export async function updateExercise(
  api: Transport,
  id: string,
  body: { expectedVersion: number; description: string; instructions: string },
) {
  return (
    await api<ExerciseDto>({
      method: "PATCH",
      path: `/api/v1/exercises/${encodeURIComponent(id)}`,
      json: body,
    })
  ).data;
}

export async function archiveExercise(
  api: Transport,
  id: string,
  expectedVersion: number,
) {
  await api({
    method: "POST",
    path: `/api/v1/exercises/${encodeURIComponent(id)}/archive`,
    json: { expectedVersion },
    responseType: "none",
  });
}

export async function exerciseHistory(
  api: Transport,
  id: string,
  page = 1,
  signal?: AbortSignal,
) {
  return (
    await api<ExerciseRevisionDto[]>({
      path: `/api/v1/exercises/${encodeURIComponent(id)}/history`,
      query: { page, pageSize: 50 },
      signal,
    })
  ).data;
}

export async function setFavorite(
  api: Transport,
  id: string,
  favorite: boolean,
) {
  await api({
    method: favorite ? "PUT" : "DELETE",
    path: `/api/v1/exercises/${encodeURIComponent(id)}/favorite`,
    responseType: "none",
  });
}

export async function listTags(
  api: Transport,
  search?: string,
  signal?: AbortSignal,
) {
  return (
    await api<TagDto[]>({
      path: "/api/v1/exercise-tags",
      query: { search },
      signal,
    })
  ).data;
}

export async function createTag(api: Transport, name: string) {
  return (
    await api<TagDto>({
      method: "POST",
      path: "/api/v1/exercise-tags",
      json: { name },
    })
  ).data;
}

export async function getDictionaries(api: Transport, signal?: AbortSignal) {
  return (
    await api<DictionariesDto>({
      path: "/api/v1/exercise-dictionaries",
      signal,
    })
  ).data;
}
