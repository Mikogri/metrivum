import type { Schema } from "@trainflow/api-client-web";
import { useCoachingQuery, type Page } from "./api";

export type NavCount = { value: number; tone: "neutral" | "danger" };

/** One request per figure, asking for a single row: only the total is used. */
function useTotal(path: string, query: Record<string, string | number>, enabled: boolean) {
  return useCoachingQuery<Page<unknown>>(path, { ...query, page: 1, pageSize: 1 }, enabled).data?.total ?? 0;
}

/**
 * Things waiting for the person, per menu entry. Clients see their own invitations, check-ins,
 * unfinished applications and unpaid dues; coaches get one figure on Clients for pending
 * invitations, submitted check-ins and leads to answer. Entries with nothing waiting are omitted.
 */
export function useNavCounts(mode: "coach" | "client"): Record<string, NavCount> {
  const coach = mode === "coach";
  const invitations = useTotal(`/api/v1/coaching/${coach ? "invitations" : "my-invitations"}`, { status: "Pending" }, true);
  const applications = useTotal(`/api/v1/coaching/${coach ? "leads" : "applications"}`, { status: coach ? "Submitted" : "InProgress" }, true);
  const checkIns = useTotal("/api/v1/check-ins/requests", { role: mode, status: coach ? "Submitted" : "Available" }, true);
  const overdue = useTotal("/api/v1/check-ins/requests", { role: mode, status: "Overdue" }, !coach);
  const dues = useTotal("/api/v1/me/payment-dues", { status: "AwaitingPayment" }, !coach);
  // Payments past their due date, either way (to receive or to pay), shown in red on Transactions.
  const summary = useCoachingQuery<Schema<"TransactionSummary">>("/api/v1/me/transactions/summary").data;
  const overdueMoney = summary ? Number(summary.overdueIncoming) + Number(summary.overdueOutgoing) : 0;
  const entries: Array<[string, number, NavCount["tone"]]> = coach
    ? [["/app/clients", invitations + applications + checkIns, "neutral"], ["/app/transactions", overdueMoney, "danger"]]
    : [
        ["/app/my-invitations", invitations, "neutral"],
        ["/app/my-applications", applications, "neutral"],
        ["/app/my-check-ins", checkIns + overdue, "neutral"],
        ["/app/payments", dues, "danger"],
        ["/app/transactions", overdueMoney, "danger"],
      ];
  return Object.fromEntries(entries.filter(([, value]) => value > 0).map(([to, value, tone]) => [to, { value, tone }]));
}
