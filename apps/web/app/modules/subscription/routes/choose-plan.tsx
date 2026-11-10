import { Navigate, useNavigate, useSearchParams } from "react-router";
import { Button } from "@metrivum/ui-web";
import { AccountGate, useProfile } from "~/modules/accounts";
import { AuthHeader } from "~/modules/auth";
import { useT } from "~/shared/i18n/AppLocale";
import { privateMeta } from "~/shared/i18n/site";
import { sanitizeReturnTo } from "~/shared/session/returnTo";
import { WorkspaceScope } from "~/shared/session/WorkspaceScope";
import { Offers } from "../SubscriptionPanel";
import styles from "./choose-plan.module.css";

export const meta = () => privateMeta("Choose your plan — Metrivum");

/** The last step of a coach's sign-up: pick a plan, or carry on with Free. A paid plan opens the checkout. */
function ChoosePlan() {
  const t = useT().onboardingPlan;
  const profile = useProfile();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = sanitizeReturnTo(params.get("returnTo"));
  // Plans are for coaches; anyone else goes straight on.
  if (!profile.roles.includes("Coach")) return <Navigate to={next} replace />;
  return (
    <>
      <AuthHeader title={t.title} subtitle={t.body} />
      <div className={styles.plans}>
        {/* Plans are read in the coach workspace, the same as in the app. */}
        <WorkspaceScope roles={profile.roles}>
          <Offers embedded />
        </WorkspaceScope>
      </div>
      <Button
        variant="secondary"
        block
        onPress={() => navigate(next, { replace: true })}
      >
        {t.later}
      </Button>
    </>
  );
}

export default function ChoosePlanRoute() {
  return (
    <AccountGate mode="app">
      <ChoosePlan />
    </AccountGate>
  );
}
