import { useOutletContext } from "react-router";

/** Whether the visitor seems to have a stored session (hint only; set after hydration). */
export function usePublicSession(): boolean {
  return (
    useOutletContext<{ hasSession: boolean } | undefined>()?.hasSession ?? false
  );
}
