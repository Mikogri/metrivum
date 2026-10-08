import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Schema } from "@trainflow/api-client-web";
import { useAccountKey, useApi } from "~/shared/session/AccountScope";
import type { ApiRequest, QueryValue } from "~/shared/http";

import { useWorkspace } from "~/shared/session/WorkspaceScope";

export type Relationship = Schema<"CoachRelationshipDto">;
export type ClientRelationship = Schema<"ClientRelationshipDto">;
export type Group = Schema<"GroupDto">;
export interface Page<T> { items: T[]; page: number; pageSize: number; total: number }

export function useCoachingQuery<T>(path: string, query?: Record<string, QueryValue>, enabled = true) {
  const api = useApi();
  const account = useAccountKey();
  const { mode } = useWorkspace();
  return useQuery({ queryKey: [account, "coaching", mode, path, query], enabled,
    queryFn: async ({ signal }) => (await api<T>({ path, query, signal })).data });
}

export function useCoachingMutation<T = unknown>(onSuccess?: (result: T) => void, options: { invalidate?: boolean } = {}) {
  const api = useApi();
  const account = useAccountKey();
  const cache = useQueryClient();
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  return useMutation({
    mutationFn: async (request: ApiRequest) => (await api<T>(request)).data,
    onSuccess: async (result) => {
      if (options.invalidate !== false) await cache.invalidateQueries({ queryKey: [account, "coaching"] });
      if (mounted.current) onSuccess?.(result);
    },
  });
}
