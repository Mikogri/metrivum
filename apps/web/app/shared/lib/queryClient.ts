import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { ApiError, isAbortError, NetworkError } from "~/shared/http/errors";

/**
 * One QueryClient for the browser session. Private keys always start with the account key,
 * so accounts never share entries. Nothing is persisted to storage.
 */
export function createQueryClient(onFeatureUnavailable: () => void) {
  const handle = (error: unknown) => {
    if (error instanceof ApiError && error.code === "FEATURE_UNAVAILABLE") onFeatureUnavailable();
  };
  return new QueryClient({
    queryCache: new QueryCache({ onError: handle }),
    mutationCache: new MutationCache({ onError: handle }),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: true,
        retry: (failureCount, error) => {
          if (isAbortError(error)) return false;
          // Only transient failures are retried; 4xx (incl. 401/403) never loop.
          if (error instanceof NetworkError) return failureCount < 2;
          if (error instanceof ApiError) return error.status >= 500 && error.status !== 501 && failureCount < 2;
          return false;
        },
      },
      mutations: { retry: false },
    },
  });
}
