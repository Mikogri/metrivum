// Public API of the auth module.
export { AuthHeader, AuthFooter } from "./components/AuthHeader";
export { AuthWorking } from "./components/AuthWorking";
export { registrationRole, type RegistrationRole } from "./lib/urls";
export { changePassword, requestEmailChange, securityErrorCode, verifyPassword } from "./lib/accountSecurity";
export { authErrorText, passwordProblem } from "./lib/authErrors";
export { isValidEmail, normalizeEmail } from "./lib/email";
