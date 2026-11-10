import { Navigate } from "react-router";
import { DISCOVERY_ENABLED } from "~/shared/features";
import { DiscoverCoaches } from "../discovery";
import { privateMeta } from "~/shared/i18n/site";

export const meta = () => privateMeta("Discover coaches — Metrivum");

// Discovery is switched off for now (see shared/features.ts): the page sends people back to the app.
export default function DiscoverRoute() {
  return DISCOVERY_ENABLED ? (
    <DiscoverCoaches />
  ) : (
    <Navigate to="/app" replace />
  );
}
