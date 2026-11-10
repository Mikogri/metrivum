import { useQuery } from "@tanstack/react-query";
import { ASSET_BASE, type AnatomyManifest } from "./model";

/** Public versioned anatomy: no account data, cached for the session. */
export function useAnatomyManifest() {
  return useQuery({
    queryKey: ["anatomy", "bodyparts3d-4.0"],
    staleTime: Infinity,
    queryFn: async ({ signal }) => {
      const response = await fetch(ASSET_BASE + "manifest.json", { signal });
      if (!response.ok)
        throw new Error(`Anatomy manifest HTTP ${response.status}`);
      return (await response.json()) as AnatomyManifest;
    },
  });
}
