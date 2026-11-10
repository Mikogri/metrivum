// Public API of the auth module.
export { AuthHeader, AuthFooter } from "./components/AuthHeader";
export { AuthWorking } from "./components/AuthWorking";
export { registrationRole, type RegistrationRole } from "./lib/urls";
export {
  requestEmailChange,
  securityErrorCode,
  verifyPassword,
} from "./lib/accountSecurity";
export { authErrorText, passwordProblem } from "./lib/authErrors";
export { isValidEmail, normalizeEmail } from "./lib/email";
export {
  EMAIL_RESEND_SECONDS,
  clearPasswordRecovery,
  hasPassword,
  hasPasswordRecovery,
  isSixDigitCode,
  markPasswordRecovery,
  mfaErrorText,
  needsSecondFactor,
  sessionAal,
  verifiedFactors,
  verifiedTotp,
  verifyAuthenticatorCode,
  type AssuranceLevel,
} from "./lib/assurance";
export { SecondFactorForm, factorName } from "./components/SecondFactorForm";
export { CodeInput } from "./components/CodeInput";
export { callbackUrl } from "./lib/urls";
export { emailChangeUrl } from "./lib/accountSecurity";
export { useCooldown } from "./lib/useCooldown";

export { useTurnstile } from "./components/Turnstile";
