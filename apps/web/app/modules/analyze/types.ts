import type { Schema } from "@trainflow/api-client-web";

export type Overview = Schema<"AnalysisOverview">;
export type AnalysisContext = Schema<"AnalysisContext">;
export type FinanceData = Pick<Overview, "finance" | "previousFinance">;
export type ClientsData = Pick<Overview, "clients" | "previousClients" | "acquisition">;
export type CheckInsData = Pick<Overview, "checkIns" | "previousCheckIns" | "messaging">;
export type TrainingData = Pick<Overview, "training">;
