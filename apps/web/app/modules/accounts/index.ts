// Public API of the accounts module (profile, onboarding state and the account gate).
export { AccountGate } from "./components/AccountGate";
export { BootScreen } from "./components/BootScreen";
export { useProfile, useProfileQuery, profileKey } from "./api/useProfile";
export { getMe, completeOnboarding, updateProfile } from "./api/profile";
export { timeZones } from "./lib/timeZones";

export { UserAutocomplete, type UserSuggestion } from "./components/UserAutocomplete";
export { displayNameValid, normalizeDisplayName, usernameProblem } from "./lib/identity";
