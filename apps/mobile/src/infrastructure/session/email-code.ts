import type { Session } from "@supabase/supabase-js";
import { AuthFlowError, passwordProblem } from "./auth-policy";
import { isValidEmail } from "./email";

export type EmailCodeType = "signup" | "email" | "recovery";
export type EmailChallenge = { slot: number; email: string; type: EmailCodeType; accountId: string | null; role?: "Coach" | "Client"; createdAt: number; resendAt: number };
type Reply = { error: { code?: string } | null };
type Auth = {
    signInWithOtp: (input: { email: string; options: { shouldCreateUser: boolean } }) => Promise<Reply>;
    signUp: (input: { email: string; password: string; options: { data: Record<string, unknown> } }) => Promise<Reply & { data: { session: Session | null; user?: { identities?: unknown[] } | null } }>;
    resetPasswordForEmail: (email: string) => Promise<Reply>;
    resend: (input: { email: string; type: "signup" }) => Promise<Reply>;
    verifyOtp: (input: { email: string; token: string; type: EmailCodeType }) => Promise<Reply & { data: { session: Session | null } }>;
    signOut: (input: { scope: "local" }) => Promise<unknown>;
};
const unknownAccount = (error: Reply["error"]) => ["otp_disabled", "signup_disabled", "user_not_found"].includes(error?.code ?? "");

/** A single pending email challenge owns its slot; cancellation fences late Auth responses. */
export function createEmailCodeFlow(ports: {
    auth: (slot: number) => Auth;
    occupying: (slot: number) => { id: string; email?: string } | undefined;
    complete: (slot: number, session: Session, challenge: EmailChallenge) => Promise<void>;
    changed: (challenge: EmailChallenge | null) => void;
    now?: () => number;
}) {
    const now = ports.now ?? Date.now;
    let pending: EmailChallenge | null = null, generation = 0, busy = false;
    const set = (value: EmailChallenge | null) => { pending = value; ports.changed(value); };
    async function exclusive<T>(action: () => Promise<T>) {
        if (busy) throw new AuthFlowError("operationBusy");
        busy = true;
        try { return await action(); } finally { busy = false; }
    }
    function current() {
        if (!pending || now() - pending.createdAt >= 3_600_000) throw new AuthFlowError("invalidCode");
        const owner = ports.occupying(pending.slot);
        if (owner && (owner.id !== pending.accountId || owner.email?.toLowerCase() !== pending.email)) throw new AuthFlowError("identityChanged");
        return pending;
    }
    return {
        pending: () => pending,
        isBusy: () => busy,
        cancel: () => { generation++; set(null); },
        request: (slot: number, address: string, type: EmailCodeType, registration?: { password: string; role: "Coach" | "Client"; accepted: boolean }) => exclusive(async () => {
            const email = address.trim().toLowerCase();
            if (!isValidEmail(email)) throw new AuthFlowError("emailInvalid");
            if (![0, 1, 2].includes(slot)) throw new AuthFlowError("slotUnavailable");
            const owner = ports.occupying(slot);
            if (owner && (type !== "recovery" || owner.email?.toLowerCase() !== email)) throw new AuthFlowError("slotUnavailable");
            if (type === "signup") {
                if (!registration?.accepted) throw new AuthFlowError("termsRequired");
                const problem = passwordProblem(registration.password, email);
                if (problem) throw new AuthFlowError(problem);
            }
            const ticket = ++generation, auth = ports.auth(slot);
            const challenge: EmailChallenge = { slot, email, type, accountId: owner?.id ?? null, role: registration?.role, createdAt: now(), resendAt: now() + 60_000 };
            let session: Session | null = null;
            if (type === "signup") {
                const result = await auth.signUp({ email, password: registration!.password, options: { data: {
                    terms_version: "v1", terms_accepted_at: new Date(now()).toISOString(),
                    // An onboarding selection only; API authorization never reads this hint.
                    registration_role: registration!.role,
                } } });
                if (["user_already_exists", "email_exists"].includes(result.error?.code ?? "") || (!result.error && result.data.user && !result.data.session && (result.data.user.identities?.length ?? 0) === 0)) throw new AuthFlowError("userExists");
                if (result.error) throw result.error;
                session = result.data.session;
            } else {
                const result = type === "email" ? await auth.signInWithOtp({ email, options: { shouldCreateUser: false } }) : await auth.resetPasswordForEmail(email);
                if (result.error && !(type === "email" && unknownAccount(result.error))) throw result.error;
            }
            if (ticket !== generation) { if (session) await auth.signOut({ scope: "local" }); return; }
            if (session) {
                if (session.user.email?.toLowerCase() !== email) { await auth.signOut({ scope: "local" }); throw new AuthFlowError("identityChanged"); }
                try { await ports.complete(slot, session, challenge); }
                catch (error) { await auth.signOut({ scope: "local" }); throw error; }
                return;
            }
            set(challenge);
        }),
        resend: () => exclusive(async () => {
            const challenge = current(), ticket = generation;
            if (now() < challenge.resendAt) throw new AuthFlowError("rateLimited");
            const auth = ports.auth(challenge.slot);
            const result = challenge.type === "signup" ? await auth.resend({ type: "signup", email: challenge.email })
                : challenge.type === "recovery" ? await auth.resetPasswordForEmail(challenge.email)
                : await auth.signInWithOtp({ email: challenge.email, options: { shouldCreateUser: false } });
            if (result.error && !(challenge.type === "email" && unknownAccount(result.error))) throw result.error;
            if (ticket === generation) set({ ...challenge, resendAt: now() + 60_000 });
        }),
        verify: (input: string) => exclusive(async () => {
            const challenge = current(), token = input.replace(/\s/g, ""), ticket = generation;
            if (!/^\d{6,10}$/.test(token)) throw new AuthFlowError("invalidCode");
            const auth = ports.auth(challenge.slot);
            const result = await auth.verifyOtp({ email: challenge.email, token, type: challenge.type });
            if (result.error) throw result.error;
            const session = result.data.session;
            if (!session) throw new AuthFlowError("invalidCode");
            try {
                if (ticket !== generation) throw new AuthFlowError("invalidCode");
                if (session.user.email?.toLowerCase() !== challenge.email || (challenge.accountId !== null && session.user.id !== challenge.accountId)) throw new AuthFlowError("identityChanged");
                await ports.complete(challenge.slot, session, challenge);
                set(null);
            } catch (error) { await auth.signOut({ scope: "local" }); throw error; }
        }),
    };
}
