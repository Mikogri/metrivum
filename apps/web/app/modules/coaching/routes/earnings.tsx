import { privateMeta } from "~/shared/i18n/site";

export const meta = () => privateMeta("Earnings — Metrivum");

import { redirect, type ClientLoaderFunctionArgs } from "react-router";

export function clientLoader({ request }: ClientLoaderFunctionArgs) {
  return redirect("/app/analyze" + new URL(request.url).search);
}

export default function EarningsRoute() {
  return null;
}
