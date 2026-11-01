import { useQueryClient } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";
import type { FolderDto, PagedOfFolderDto } from "@metrivum/api-client-web";
import { useAccountKey } from "~/shared/session/AccountScope";
import { trainingKeys } from "../queries";

/**
 * Folder names known from already-loaded folder lists. The API has no "get folder by id"
 * endpoint (see api-gaps.md), so breadcrumbs are built from what the tree has loaded.
 */
export function useFolderLookup(): Map<string, FolderDto> {
  const queryClient = useQueryClient();
  const a = useAccountKey();
  const cache = queryClient.getQueryCache();
  const version = useSyncExternalStore(
    (notify) => cache.subscribe(notify),
    () => cache.getAll().filter((q) => q.queryKey[1] === "training" && q.queryKey[2] === "folders").reduce((sum, q) => sum + q.state.dataUpdatedAt, 0),
    () => 0,
  );
  void version;
  const map = new Map<string, FolderDto>();
  for (const [, data] of queryClient.getQueriesData<PagedOfFolderDto>({ queryKey: trainingKeys.folders(a) })) {
    for (const folder of data?.items ?? []) map.set(folder.id, folder);
  }
  return map;
}

export function folderPath(lookup: Map<string, FolderDto>, folderId: string | null): Array<FolderDto | { id: string; name: null }> {
  const path: Array<FolderDto | { id: string; name: null }> = [];
  let current = folderId;
  const seen = new Set<string>();
  while (current && !seen.has(current)) {
    seen.add(current);
    const folder = lookup.get(current);
    if (!folder) {
      path.unshift({ id: current, name: null });
      break;
    }
    path.unshift(folder);
    current = folder.parentId;
  }
  return path;
}
