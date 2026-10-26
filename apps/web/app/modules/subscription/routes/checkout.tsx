import { useSearchParams } from "react-router";
import { privateMeta } from "~/shared/i18n/site";
import { Checkout } from "../Checkout";

export const meta = () => privateMeta("Checkout — Metrivum");

/** Checkout for the plan chosen in the plans dialog (/app/checkout?plan=Pro), shown as a full-screen layer. */
export default function CheckoutRoute() {
  const [params] = useSearchParams();
  return <Checkout planId={params.get("plan") ?? ""} />;
}
