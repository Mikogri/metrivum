import { redirect } from "react-router";
import { privateMeta } from "~/shared/i18n/site";

export const meta = () => privateMeta("Exercises — TrainFlow");

export function clientLoader() { return redirect("/app/exercises"); }
export default function AnatomyRedirect() { return null; }
