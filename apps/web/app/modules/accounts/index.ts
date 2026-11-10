// Public API of the accounts module (profile, onboarding state and the account gate).
export { AccountGate } from "./components/AccountGate";
export { BootScreen } from "./components/BootScreen";
export { useProfile, useProfileQuery, profileKey } from "./api/useProfile";
export {
  AVATAR_TYPES,
  avatarKey,
  useAvatarActions,
  useAvatarUrl,
} from "./api/avatar";
export { getMe, completeOnboarding, updateProfile } from "./api/profile";
export { timeZones } from "./lib/timeZones";

export {
  UserAutocomplete,
  type UserSuggestion,
} from "./components/UserAutocomplete";
export {
  displayNameValid,
  nameParts,
  namePartValid,
  normalizeDisplayName,
  usernameProblem,
} from "./lib/identity";
export {
  DETAIL_GROUPS,
  DetailFields,
  ageFrom,
  detailProblems,
  detailsFromValues,
  detailsToValues,
  emptyDetails,
  type DetailGroup,
  type DetailKey,
  type Details,
} from "./components/ProfileDetails";
export {
  getPerson,
  personKey,
  profileFieldsKey,
  type Person,
} from "./api/people";
export { BodySummary } from "./components/BodySummary";
export {
  useProfileCompleteness,
  type CompletenessItem,
} from "./api/useCompleteness";
