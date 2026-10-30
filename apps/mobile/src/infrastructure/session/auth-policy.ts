import type { TranslationKey } from "../i18n/messages";

export class AuthFlowError extends Error {
    constructor(public readonly code: string) { super(code); }
}
const commonPasswords = new Set([
    "12345678", "123456789", "1234567890", "12345678910", "11111111", "00000000", "87654321", "123123123", "1q2w3e4r", "1qaz2wsx",
    "password", "password1", "password12", "password123", "passw0rd", "qwertyui", "qwertyuiop", "qwerty123", "qwerty12", "asdfghjk",
    "iloveyou", "sunshine", "princess", "football", "baseball", "superman", "trustno1", "welcome1", "letmein1", "abcd1234",
    "zaq12wsx", "q1w2e3r4", "aaaaaaaa", "abcdefgh", "admin123", "changeme", "computer", "michael1", "internet", "starwars",
    "trainflow", "trainflow1", "trainflow123", "haslo123", "kochamcie", "polska12", "qazwsxedc", "zxcvbnm1", "monkey12", "dragon12",
]);
export function passwordProblem(password: string, email = ""): TranslationKey | null {
    if (password.length < 8) return "auth.passwordShort";
    // Count UTF-8 bytes without assuming a browser TextEncoder exists in Hermes.
    const bytes = Array.from(password).reduce((total, character) => {
        const code = character.codePointAt(0)!;
        return total + (code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4);
    }, 0);
    if (bytes > 72) return "auth.passwordLong";
    const lower = password.toLowerCase(), name = email.split("@")[0]?.toLowerCase() ?? "";
    return commonPasswords.has(lower) || new Set(lower).size <= 2 || (name.length >= 4 && lower.includes(name)) ? "auth.passwordWeak" : null;
}
export function authErrorKey(error: unknown): TranslationKey {
    const e = error as { code?: string; status?: number; name?: string; message?: string } | undefined;
    if (e?.status === 429) return "auth.rateLimited";
    if ((e?.status ?? 0) >= 500) return /smtp|sending.*email|mailer/i.test(e?.message ?? "") ? "auth.emailDelivery" : "auth.serviceUnavailable";
    const codes: Record<string, TranslationKey> = {
        invalid_credentials: "auth.invalidCredentials", email_not_confirmed: "auth.emailUnconfirmed",
        user_already_exists: "auth.userExists", email_exists: "auth.userExists", userExists: "auth.userExists",
        over_email_send_rate_limit: "auth.rateLimited", over_request_rate_limit: "auth.rateLimited", rateLimited: "auth.rateLimited",
        otp_expired: "auth.invalidCode", invalidCode: "auth.invalidCode", identityChanged: "auth.identityChanged",
        email_address_invalid: "auth.emailInvalid", emailInvalid: "auth.emailInvalid", termsRequired: "auth.termsRequired",
        operationBusy: "auth.operationBusy", slotUnavailable: "auth.maxAccounts", weak_password: "auth.passwordWeak",
        "auth.passwordShort": "auth.passwordShort", "auth.passwordLong": "auth.passwordLong", "auth.passwordWeak": "auth.passwordWeak",
    };
    return codes[e?.code ?? ""] ?? (e?.name === "AuthRetryableFetchError" || error instanceof TypeError ? "auth.network" : "auth.genericError");
}
