import { useCallback } from "react";
import { toast } from "@metrivum/ui-web";
import { isAbortError } from "~/shared/http/errors";
import { useT } from "~/shared/i18n/AppLocale";
import { errorText, traceIdOf } from "./errorText";

/** Shows a failed action as a toast. Aborted/stale requests are silent by design. */
export function useErrorToast() {
  const m = useT();
  return useCallback(
    (error: unknown, title?: string) => {
      if (isAbortError(error)) return;
      const trace = traceIdOf(error);
      toast({
        tone: "danger",
        title: title ?? errorText(m, error),
        description: title
          ? errorText(m, error)
          : trace
            ? m.common.reference(trace)
            : undefined,
      });
    },
    [m],
  );
}
