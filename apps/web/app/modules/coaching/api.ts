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

export const groupInvalidation = { invalidate: ["/api/v1/coaching/groups", "/api/v1/coaching/clients", "/api/v1/coaching/relationships", "/api/v1/coaching/my-coaches", "/api/v1/analyze"] } as const;

export function useCoachingMutation<T = unknown>(onSuccess?: (result: T) => void, options: { invalidate?: boolean | readonly string[] } = {}) {
  const api = useApi();
  const account = useAccountKey();
  const cache = useQueryClient();
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  return useMutation({
    mutationFn: async (request: ApiRequest) => (await api<T>(request)).data,
    onSuccess: (result) => {
      if (mounted.current) onSuccess?.(result);
      if (options.invalidate !== false) {
        const paths = options.invalidate;
        void cache.invalidateQueries({ queryKey: [account, "coaching"],
          ...(Array.isArray(paths) ? { predicate: ({ queryKey }: { queryKey: readonly unknown[] }) =>
            typeof queryKey[3] === "string" && paths.some(path => queryKey[3] === path || (queryKey[3] as string).startsWith(`${path}/`)) } : {}),
        });
      }
    },
  });
}
