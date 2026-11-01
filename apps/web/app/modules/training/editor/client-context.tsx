import { createContext, useContext } from "react";
import type { Quantity } from "@metrivum/api-client-web";

export interface ClientFormulaContextValue {
  relationshipId?: string;
  variables: Record<string, Quantity>;
  sourceVersions: Record<string, string>;
  isStale: boolean;
  isLoading?: boolean;
  exerciseMaxReps?: Record<string, number>;
  blockSources?: string[];
}

export const ClientFormulaContext = createContext<ClientFormulaContextValue>({ variables: {}, sourceVersions: {}, isStale: false });
export const useClientFormulaContext = () => useContext(ClientFormulaContext);
