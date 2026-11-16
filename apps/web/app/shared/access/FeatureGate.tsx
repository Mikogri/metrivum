import { Lock } from "lucide-react";
import type { ReactNode } from "react";
import type { FeatureKey } from "@metrivum/api-client-web";
import {
  EmptyState,
  LinkButton,
  Skeleton,
  Tooltip,
  TooltipTrigger,
} from "@portable-ui/react";
import { Focusable } from "react-aria-components";
import { useT } from "~/shared/i18n/AppLocale";
import { useFeatureAccess, type FeatureAccess } from "./useFeatureAccess";
import { LockedArea } from "./LockedArea";
import styles from "./FeatureGate.module.css";

export function useFeatureReasonText() {
  const m = useT();
  return (access: FeatureAccess) =>
    m.access.reasons[access.state] ?? m.access.reasons.unknown!;
}

/**
 * Renders children only when the API grants the feature. Otherwise renders `fallback`
 * (default: nothing). The UI gate never replaces the API's own check.
 */
export function FeatureGate({
  feature,
  children,
  fallback = null,
}: {
  feature: FeatureKey;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const access = useFeatureAccess(feature);
  if (access.pending) return null;
  return <>{access.allowed ? children : fallback}</>;
}

/** Wraps a disabled control with a tooltip explaining why it is unavailable; `upgrade={false}` drops the plan link beside it. */
export function LockedReason({
  access,
  upgrade = true,
  children,
}: {
  access: FeatureAccess;
  upgrade?: boolean;
  children: ReactNode;
}) {
  const reason = useFeatureReasonText();
  const m = useT();
  if (access.allowed) return <>{children}</>;
  return (
    <span className={styles.lockedGroup}>
      <TooltipTrigger delay={200}>
        <Focusable>
          <span
            className={styles.lockedWrap}
            tabIndex={0}
            aria-label={reason(access)}
          >
            {children}
          </span>
        </Focusable>
        <Tooltip>{reason(access)}</Tooltip>
      </TooltipTrigger>
      {upgrade && access.state === "feature_not_in_plan" && (
        <LinkButton href="/app/subscription" size="sm" variant="ghost">
          {m.access.upgradeToPro}
        </LinkButton>
      )}
    </span>
  );
}

/** Route-level guard: a locked feature shows an explanation instead of the screen. */
export function RequireFeature({
  feature,
  children,
}: {
  feature: FeatureKey;
  children: ReactNode;
}) {
  const access = useFeatureAccess(feature);
  const m = useT();
  const reason = useFeatureReasonText();
  if (access.pending) {
    return (
      <div className={styles.pending} aria-busy="true">
        <Skeleton height="2rem" width="40%" />
        <Skeleton height="12rem" radius="lg" />
      </div>
    );
  }
  if (!access.allowed && access.state === "feature_not_in_plan") {
    const name = m.access.features[feature] ?? feature;
    return (
      <LockedArea
        locked
        variant="page"
        title={m.access.proTitle(name)}
        body={m.access.proBody}
      >
        {children}
      </LockedArea>
    );
  }
  if (!access.allowed) {
    const name = m.access.features[feature] ?? feature;
    return (
      <EmptyState
        icon={<Lock />}
        title={m.access.lockedTitle(name)}
        description={reason(access)}
        actions={
          access.state === "feature_not_in_plan" ? (
            <LinkButton href="/app/subscription">
              {m.access.upgradeToPro}
            </LinkButton>
          ) : undefined
        }
      />
    );
  }
  return <>{children}</>;
}
