import { Outlet } from "react-router";
import { AccountGate } from "~/modules/accounts";

/** The assistant's authorization request needs a signed-in account; it is shown in the sign-in layout, without the app around it. */
export default function ConsentGate() {
  return <AccountGate mode="app"><Outlet /></AccountGate>;
}
