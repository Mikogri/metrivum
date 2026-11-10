export {
  SessionProvider,
  useSessionManager,
  useSessionState,
  useActiveAccount,
} from "./SessionProvider";
export {
  AccountScope,
  useAccountContext,
  useApi,
  useAccountKey,
  type AccountContextValue,
} from "./AccountScope";
export {
  sessionManager,
  SessionManager,
  type SignedInAccount,
  type SessionState,
} from "./manager";
export { sanitizeReturnTo, loginPath } from "./returnTo";
export { hasUnsavedWork, useUnsavedWorkGuard } from "./dirty-guard";
export { MAX_ACCOUNTS, SLOT_IDS, type SlotId } from "./storage-keys";
export { supabaseConfigured } from "./supabase";
