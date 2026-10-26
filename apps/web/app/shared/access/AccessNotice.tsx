import type { ReactNode } from "react";
import { Alert, LinkButton } from "@trainflow/ui-web";
import { useT } from "~/shared/i18n/AppLocale";
import type { FeatureAccess } from "./useFeatureAccess";

/**
 * Why a feature can't be used right now, as a warning: the coach is blocked, not merely informed.
 * A reached limit also says how to get past it; `actions` can offer the way (e.g. the plans panel).
 */
export function AccessNotice({ access, actions, className }: { access: FeatureAccess; actions?: ReactNode; className?: string }) {
  const m = useT();
  if (access.allowed || access.pending) return null;
  const limit = access.state === "limit_reached";
  return (
    <Alert tone="warning" title={m.access.reasons[access.state] ?? m.access.reasons.unknown} actions={access.state === "feature_not_in_plan" ? <LinkButton href="/app/subscription" size="sm">{m.access.upgradeToPro}</LinkButton> : limit ? actions ?? <LinkButton href="/app/subscription" size="sm">{m.access.seePlans}</LinkButton> : undefined} className={className}>
      {limit ? m.access.limitHelp : undefined}
    </Alert>
  );
}
