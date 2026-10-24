import { Button, ErrorState } from "@trainflow/ui-web";
import { ApiError } from "~/shared/http/errors";
import { useT } from "~/shared/i18n/AppLocale";
import { errorText, traceIdOf } from "./errorText";

/** Private detail pages conceal inaccessible resources; transient errors retain an explicit retry. */
export function isUnavailableResource(error: unknown) {
  return error instanceof ApiError && (error.status === 403 || error.status === 404);
}
export function ResourceError({ error, retry }: { error: unknown; retry?: () => void }) {
  const m = useT();
  const missing = isUnavailableResource(error);
  return <ErrorState title={missing ? m.errors.byCode.RESOURCE_NOT_FOUND! : errorText(m, error)}
    reference={missing ? undefined : traceIdOf(error)}
    actions={!missing && retry ? <Button onPress={retry}>{m.common.retry}</Button> : undefined} />;
}
