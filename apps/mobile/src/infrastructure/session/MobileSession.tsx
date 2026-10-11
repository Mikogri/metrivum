import { useI18n } from "../i18n";
import {
    createContext,
    useContext,
    useEffect,
    useMemo,
    useCallback,
    useRef,
    useState,
    type PropsWithChildren,
} from "react";
import { AppState } from "react-native";
import { File, Paths } from "expo-file-system";
import {
    createClient,
    type Session,
    type SupabaseClient,
} from "@supabase/supabase-js";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";
import * as Linking from "expo-linking";
import type { ProfileResponse } from "@trainflow/api-client-web";
import {
    createTransport,
    type Transport,
} from "@trainflow/api-client-web/transport";
import {
    BlockingOverlay,
    Screen,
    Section,
    Text,
    Field,
    Button,
    ErrorState,
    ListItem,
    LoadingState,
    SegmentedControl,
    Switch,
} from "@trainflow/ui-mobile";
import { createChunkStorage } from "./chunk-storage";
import { openDraftStore, type DraftStore } from "../persistence/DraftStore";
import { revokePush } from "../networking/push";
import {
    createAuthAttempts,
    parseAuthCallback,
    assertCallbackIdentity,
    type AuthAttempt,
} from "./auth-callback";

export const API_URL = process.env.EXPO_PUBLIC_API_URL || "";
const secure = createChunkStorage(
    {
        getItem: SecureStore.getItemAsync,
        setItem: (key, value) =>
            SecureStore.setItemAsync(key, value, {
                keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
            }),
        removeItem: SecureStore.deleteItemAsync,
    },
    Crypto.randomUUID,
);
const authAttempts = createAuthAttempts(secure, Crypto.randomUUID);
const clients = new Map<number, SupabaseClient>();
function client(slot: number) {
    let value = clients.get(slot);
    if (!value) {
        value = createClient(
            process.env.EXPO_PUBLIC_SUPABASE_URL!,
            process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
            {
                auth: {
                    storage: secure,
                    storageKey: `trainflow.auth.${slot}`,
                    flowType: "pkce",
                    persistSession: true,
                    autoRefreshToken: false,
                    detectSessionInUrl: false,
                },
            },
        );
        clients.set(slot, value);
    }
    return value;
}
export type Account = { slot: number; session: Session };
/** Retained-account push registration is identity-bound and never changes the active session. */
export function retainedAccountTransport(
    account: Account,
    signal: AbortSignal,
): Transport {
    return createTransport({
        baseUrl: API_URL,
        accountSignal: () => signal,
        isCurrent: () => !signal.aborted,
        getAccessToken: async (options) => {
            const response = options?.forceRefresh
                ? await client(account.slot).auth.refreshSession()
                : await client(account.slot).auth.getSession();
            if (response.error) throw response.error;
            if (response.data.session?.user.id !== account.session.user.id)
                throw Error("Retained account changed.");
            return response.data.session.access_token;
        },
    });
}
type Role = "coach" | "client";
type MobileContextValue = {
    api: Transport;
    accountId: string;
    role: Role;
    setRole: (role: Role) => void;
    profile: ProfileResponse;
    drafts: DraftStore;
    accountSignal: AbortSignal;
    getAccessToken: () => Promise<string | null>;
    refreshProfile: () => Promise<void>;
};
const MobileContext = createContext<MobileContextValue | null>(null);
export function useMobile() {
    const value = useContext(MobileContext);
    if (!value) throw Error("Mobile session is unavailable.");
    return value;
}
type AccountsValue = {
    accounts: Account[];
    active: number | null;
    switchAccount: (slot: number) => Promise<void>;
    addAccount: () => void;
    signOut: () => Promise<void>;
    requestPasswordReset: (email: string) => Promise<void>;
};
const AccountsContext = createContext<AccountsValue | null>(null);
export function useAccounts() {
    return useContext(AccountsContext)!;
}

export function MobileSession({ children }: PropsWithChildren) {
    const { t } = useI18n();
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [active, setActive] = useState<number | null>(null);
    const [loading, setLoading] = useState(true);
    const [adding, setAdding] = useState(false);
    const [transitioning, setTransitioning] = useState(false);
    const [epoch, setEpoch] = useState(0);
    const [error, setError] = useState<unknown>();
    const [linkState, setLinkState] = useState<"idle" | "working" | "failed">(
        "idle",
    );
    const [recovery, setRecovery] = useState<{
        slot: number;
        userId: string;
        email: string;
        expiresAt: number;
    }>();
    const [confirmed, setConfirmed] = useState<{
        slot: number;
        email: string;
    }>();
    const transitionLock = useRef(false);
    const callbackLock = useRef(false);
    const latestAccounts = useRef(accounts);
    latestAccounts.current = accounts;
    const receivedLinks = useRef(new Set<string>());
    const recoveryEvents = useRef(new Set<number>());
    const resetLock = useRef(false);
    const dispose = useRef<(wipe?: boolean) => Promise<void>>(async () => {});
    const configured =
        !!API_URL &&
        !!process.env.EXPO_PUBLIC_SUPABASE_URL &&
        !!process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    useEffect(() => {
        if (!configured) {
            setLoading(false);
            return;
        }
        // Cache files are disposable, including remnants of a killed process.
        try {
            for (const entry of Paths.cache.list())
                if (
                    entry instanceof File &&
                    /^chat-[a-f0-9-]+\.[a-z0-9]+$/i.test(entry.name)
                )
                    entry.delete();
        } catch {
            /* A cache cleanup failure must not prevent authentication. */
        }
        let mounted = true;
        const subscriptions = [0, 1, 2].map(
            (slot) =>
                client(slot).auth.onAuthStateChange((event, session) => {
                    if (!mounted) return;
                    if (event === "PASSWORD_RECOVERY")
                        recoveryEvents.current.add(slot);
                    if (event === "SIGNED_OUT")
                        recoveryEvents.current.delete(slot);
                    setAccounts((current) => {
                        const next = [
                            ...current.filter((item) => item.slot !== slot),
                            ...(session ? [{ slot, session }] : []),
                        ];
                        latestAccounts.current = next;
                        return next;
                    });
                }).data.subscription,
        );
        void Promise.all(
            [0, 1, 2].map(async (slot) => ({
                slot,
                session: (await client(slot).auth.getSession()).data.session,
            })),
        )
            .then(async (all) => {
                let valid = all.filter(
                    (item): item is Account => !!item.session,
                );
                const expiredRecoverySlots = new Set<number>();
                const previous = Number(
                    await SecureStore.getItemAsync("active-account"),
                );
                for (const item of valid) {
                    const raw = await secure.getItem(
                        `trainflow.recovery.${item.slot}`,
                    );
                    if (raw) {
                        try {
                            const pending = JSON.parse(raw) as {
                                slot: number;
                                userId: string;
                                email: string;
                                expiresAt: number;
                            };
                            if (
                                pending.slot === item.slot &&
                                pending.userId === item.session.user.id &&
                                pending.email ===
                                    item.session.user.email?.toLowerCase() &&
                                Number.isFinite(pending.expiresAt) &&
                                pending.expiresAt > Date.now() &&
                                pending.expiresAt <= Date.now() + 3600000 &&
                                mounted
                            )
                                setRecovery(pending);
                            else {
                                expiredRecoverySlots.add(item.slot);
                                await secure.removeItem(
                                    `trainflow.recovery.${item.slot}`,
                                );
                            }
                        } catch {
                            expiredRecoverySlots.add(item.slot);
                            await secure.removeItem(
                                `trainflow.recovery.${item.slot}`,
                            );
                        }
                    }
                }
                for (const slot of expiredRecoverySlots)
                    await client(slot).auth.signOut({ scope: "local" });
                valid = valid.filter(
                    (item) => !expiredRecoverySlots.has(item.slot),
                );
                if (mounted) {
                    latestAccounts.current = valid;
                    setAccounts(valid);
                    setActive(
                        valid.find((item) => item.slot === previous)?.slot ??
                            valid[0]?.slot ??
                            null,
                    );
                }
            })
            .catch(setError)
            .finally(() => {
                if (mounted) setLoading(false);
            });
        return () => {
            mounted = false;
            subscriptions.forEach((subscription) => subscription.unsubscribe());
        };
    }, [configured]);
    async function switchAccount(slot: number) {
        if (transitionLock.current || callbackLock.current) return;
        if (!latestAccounts.current.some((item) => item.slot === slot)) {
            setError(
                Error("This saved account is unavailable. Sign in again."),
            );
            return;
        }
        transitionLock.current = true;
        setTransitioning(true);
        try {
            await dispose.current();
            await SecureStore.setItemAsync("active-account", String(slot));
            setActive(slot);
            setAdding(false);
            setEpoch((value) => value + 1);
        } catch (failure) {
            setError(failure);
        } finally {
            transitionLock.current = false;
            setTransitioning(false);
        }
    }
    async function signOut() {
        if (active === null) return;
        if (transitionLock.current || callbackLock.current) return;
        transitionLock.current = true;
        setTransitioning(true);
        try {
            await dispose.current(true);
            await client(active).auth.signOut({ scope: "local" });
            await authAttempts.cancel(active);
            await secure.removeItem(`trainflow.recovery.${active}`);
            setAccounts((items) =>
                items.filter((item) => item.slot !== active),
            );
            setActive(null);
            await SecureStore.deleteItemAsync("active-account");
        } catch (failure) {
            setError(failure);
        } finally {
            transitionLock.current = false;
            setTransitioning(false);
        }
    }
    async function requestPasswordReset(email: string) {
        const normalized = email.trim().toLowerCase();
        if (
            !normalized ||
            transitionLock.current ||
            callbackLock.current ||
            resetLock.current
        )
            throw Error(
                "Wait for the current account operation before requesting a link.",
            );
        const existing = latestAccounts.current.find(
            (item) => item.session.user.email?.toLowerCase() === normalized,
        );
        const slot =
            existing?.slot ??
            [0, 1, 2].find(
                (value) =>
                    !latestAccounts.current.some((item) => item.slot === value),
            );
        if (slot === undefined)
            throw Error(
                "Three accounts are saved. Remove one before recovering a different account.",
            );
        resetLock.current = true;
        try {
            const pending = await authAttempts.begin(
                slot,
                normalized,
                "recovery",
                existing?.session.user.id ?? null,
            );
            const result = await client(slot).auth.resetPasswordForEmail(
                normalized,
                { redirectTo: pending.redirectTo },
            );
            if (result.error) {
                await authAttempts.cancel(slot);
                throw result.error;
            }
        } finally {
            resetLock.current = false;
        }
    }
    async function handleAuthLink(url: string) {
        if (
            callbackLock.current ||
            transitionLock.current ||
            receivedLinks.current.has(url)
        )
            return;
        try {
            if (!parseAuthCallback(url)) return;
        } catch (failure) {
            setError(failure);
            setLinkState("failed");
            return;
        }
        receivedLinks.current.add(url);
        callbackLock.current = true;
        setLinkState("working");
        setError(undefined);
        let attempt: AuthAttempt | undefined;
        let receivedSession = false;
        try {
            const consumed = await authAttempts.consume(url);
            if (!consumed) return;
            attempt = consumed.attempt;
            const occupying = latestAccounts.current.find(
                (item) => item.slot === attempt!.slot,
            );
            if (
                occupying &&
                (attempt.accountId !== occupying.session.user.id ||
                    occupying.session.user.email?.toLowerCase() !==
                        attempt.email)
            )
                throw Error(
                    "This account slot changed after the link was requested. Request a new link.",
                );
            await dispose.current();
            recoveryEvents.current.delete(attempt.slot);
            const result = await client(
                attempt.slot,
            ).auth.exchangeCodeForSession(consumed.code);
            if (result.error) throw result.error;
            if (!result.data.session)
                throw Error("No session was returned. Request a new link.");
            receivedSession = true;
            assertCallbackIdentity(attempt, result.data.session.user);
            if (
                attempt.purpose === "recovery" &&
                !recoveryEvents.current.has(attempt.slot)
            )
                throw Error(
                    "This link cannot reset a password. Request a new recovery link.",
                );
            const account = {
                slot: attempt.slot,
                session: result.data.session,
            };
            latestAccounts.current = [
                ...latestAccounts.current.filter(
                    (item) => item.slot !== account.slot,
                ),
                account,
            ];
            setAccounts(latestAccounts.current);
            if (attempt.purpose === "recovery") {
                const next = {
                    slot: attempt.slot,
                    userId: account.session.user.id,
                    email: attempt.email,
                    expiresAt: Date.now() + 15 * 60000,
                };
                await secure.setItem(
                    `trainflow.recovery.${attempt.slot}`,
                    JSON.stringify(next),
                );
                setRecovery(next);
            } else setConfirmed({ slot: attempt.slot, email: attempt.email });
            setLinkState("idle");
            setEpoch((value) => value + 1);
        } catch (failure) {
            if (attempt && receivedSession)
                await client(attempt.slot)
                    .auth.signOut({ scope: "local" })
                    .catch(() => {});
            setError(failure);
            setLinkState("failed");
            setEpoch((value) => value + 1);
        } finally {
            callbackLock.current = false;
        }
    }
    const linkHandler = useRef(handleAuthLink);
    linkHandler.current = handleAuthLink;
    useEffect(() => {
        if (!configured || loading) return;
        const subscription = Linking.addEventListener("url", (event) => {
            void linkHandler.current(event.url);
        });
        void Linking.getInitialURL()
            .then((url) => {
                if (url) return linkHandler.current(url);
            })
            .catch(setError);
        return () => subscription.remove();
    }, [configured, loading]);
    const current = accounts.find((item) => item.slot === active);
    return (
        <AccountsContext.Provider
            value={{
                accounts,
                active,
                switchAccount,
                addAccount: () => {
                    if (!transitionLock.current && !callbackLock.current)
                        setAdding(true);
                },
                signOut,
                requestPasswordReset,
            }}
        >
            {!configured ? (
                <Screen title={t("auth.configuration")}>
                    <Text>{t("auth.configurationHelp")}</Text>
                </Screen>
            ) : loading || linkState === "working" ? (
                <Screen title="TrainFlow">
                    <LoadingState />
                </Screen>
            ) : recovery ? (
                <PasswordRecovery
                    recovery={recovery}
                    onDone={async () => {
                        await secure.removeItem(
                            `trainflow.recovery.${recovery.slot}`,
                        );
                        await switchAccount(recovery.slot);
                        setRecovery(undefined);
                    }}
                    onCancel={async () => {
                        await client(recovery.slot).auth.signOut({
                            scope: "local",
                        });
                        await secure.removeItem(
                            `trainflow.recovery.${recovery.slot}`,
                        );
                        setRecovery(undefined);
                        setEpoch((value) => value + 1);
                    }}
                />
            ) : confirmed ? (
                <Screen title={t("auth.confirmed")}>
                    <Text>
                        {t("auth.continueAs", { email: confirmed.email })}
                    </Text>
                    <Button
                        size="lg"
                        tone="primary"
                        title={t("common.continue")}
                        onPress={async () => {
                            await switchAccount(confirmed.slot);
                            setConfirmed(undefined);
                        }}
                    />
                </Screen>
            ) : linkState === "failed" ? (
                <Screen title={t("auth.invalidLink")}>
                    <Text>{t("auth.newLink")}</Text>
                    <Button
                        title={t("auth.back")}
                        onPress={() => {
                            setLinkState("idle");
                            setError(undefined);
                            setAdding(true);
                        }}
                    />
                </Screen>
            ) : adding || !current ? (
                <AuthScreen
                    accounts={accounts}
                    onSignedIn={async (slot, session) => {
                        if (session) {
                            latestAccounts.current = [
                                ...latestAccounts.current.filter(
                                    (item) => item.slot !== slot,
                                ),
                                { slot, session },
                            ];
                            setAccounts(latestAccounts.current);
                        }
                        await switchAccount(slot);
                    }}
                    onCancel={current ? () => setAdding(false) : undefined}
                />
            ) : (
                <AccountScope
                    key={`${current.slot}:${current.session.user.id}:${epoch}`}
                    account={current}
                    dispose={dispose}
                >
                    {children}
                </AccountScope>
            )}
            {transitioning && <BlockingOverlay />}
            {!!error && <ErrorState error={error} />}
        </AccountsContext.Provider>
    );
}

function AccountScope({
    account,
    dispose,
    children,
}: PropsWithChildren<{
    account: Account;
    dispose: React.RefObject<(wipe?: boolean) => Promise<void>>;
}>) {
    const { t } = useI18n();
    const [profile, setProfile] = useState<ProfileResponse>();
    const [drafts, setDrafts] = useState<DraftStore>();
    const [error, setError] = useState<unknown>();
    const [role, updateRole] = useState<Role>("client");
    const [expired, setExpired] = useState(false);
    const [password, setPassword] = useState("");
    const [authBusy, setAuthBusy] = useState(false);
    const [authNotice, setAuthNotice] = useState("");
    const reauthLock = useRef(false);
    const scope = useMemo(
        () => ({
            controller: new AbortController(),
            query: new QueryClient({
                defaultOptions: {
                    queries: { staleTime: 20_000, retry: 1 },
                    mutations: { retry: false },
                },
            }),
        }),
        [],
    );
    const auth = client(account.slot).auth;
    const getAccessToken = useMemo(
        () => async (options?: { forceRefresh?: boolean }) => {
            const response = options?.forceRefresh
                ? await auth.refreshSession()
                : await auth.getSession();
            if (response.error) {
                if (
                    response.error.status &&
                    response.error.status < 500 &&
                    response.error.status !== 429
                ) {
                    setExpired(true);
                    scope.controller.abort();
                    scope.query.clear();
                }
                throw response.error;
            }
            if (response.data.session?.user.id !== account.session.user.id) {
                setExpired(true);
                scope.controller.abort();
                scope.query.clear();
                throw Error("Account changed. Sign in again.");
            }
            return response.data.session?.access_token ?? null;
        },
        [auth, account.session.user.id, scope],
    );
    const api = useMemo(
        () =>
            createTransport({
                baseUrl: API_URL,
                getAccessToken,
                accountSignal: () => scope.controller.signal,
                isCurrent: () => !scope.controller.signal.aborted,
                onUnauthorized: () => {
                    setExpired(true);
                    scope.controller.abort();
                    scope.query.clear();
                    auth.stopAutoRefresh();
                },
            }),
        [getAccessToken, scope, auth],
    );
    const refreshProfile = useCallback(async () => {
        const result = await api<ProfileResponse>({ path: "/api/v1/me" });
        setProfile(result.data);
    }, [api]);
    useEffect(() => {
        let closed = false;
        const store = openDraftStore(account.session.user.id);
        const shutdown = async (wipe = false) => {
            if (wipe) await revokePush(api).catch(() => {});
            closed = true;
            scope.controller.abort();
            auth.stopAutoRefresh();
            scope.query.clear();
            const opened = await store.catch(() => null);
            await opened?.close(wipe);
        };
        dispose.current = shutdown;
        void store
            .then((opened) => {
                if (!closed) setDrafts(opened.store);
            })
            .catch(setError);
        void refreshProfile()
            .then(async () => {
                const saved = await SecureStore.getItemAsync(
                    `role.${account.session.user.id}`,
                );
                if (!closed && saved === "coach") updateRole("coach");
            })
            .catch(setError);
        const update = (state: string) => {
            if (
                state === "active" &&
                !closed &&
                !scope.controller.signal.aborted
            )
                auth.startAutoRefresh();
            else auth.stopAutoRefresh();
        };
        update(AppState.currentState);
        const listener = AppState.addEventListener("change", update);
        return () => {
            listener.remove();
            void shutdown().catch(() => {});
        };
    }, [account.session.user.id, api, auth, scope, dispose, refreshProfile]);
    const accountsContext = useAccounts();
    async function reauthenticate(reset: boolean) {
        if (reauthLock.current || !account.session.user.email) return;
        reauthLock.current = true;
        setAuthBusy(true);
        setError(undefined);
        try {
            if (reset) {
                await accountsContext.requestPasswordReset(
                    account.session.user.email,
                );
                setAuthNotice(t("auth.recoveryNotice"));
            } else {
                const result = await auth.signInWithPassword({
                    email: account.session.user.email,
                    password,
                });
                if (result.error) throw result.error;
                if (result.data.user.id !== account.session.user.id)
                    throw Error("The account identity changed.");
                await accountsContext.switchAccount(account.slot);
            }
        } catch (failure) {
            setError(failure);
        } finally {
            reauthLock.current = false;
            setAuthBusy(false);
        }
    }
    if (expired)
        return (
            <Screen title={t("auth.expired")}>
                <Text tone="mutedText">
                    {t("auth.retainedDrafts", {
                        email: account.session.user.email || "",
                    })}
                </Text>
                <Field
                    label={t("auth.password")}
                    secureTextEntry
                    editable={!authBusy}
                    value={password}
                    onChangeText={setPassword}
                />
                <Button
                    size="lg"
                    tone="primary"
                    title={t("auth.signIn")}
                    loading={authBusy}
                    disabled={!password}
                    onPress={() => reauthenticate(false)}
                />
                <Button
                    tone="ghost"
                    title={t("auth.forgot")}
                    disabled={authBusy}
                    onPress={() => reauthenticate(true)}
                />
                {!!authNotice && <Text>{authNotice}</Text>}
                {!!error && <ErrorState error={error} />}
                <Button
                    tone="danger"
                    title={t("auth.removeDrafts")}
                    disabled={authBusy}
                    onPress={accountsContext.signOut}
                />
            </Screen>
        );
    if (error)
        return (
            <Screen title={t("auth.account")}>
                <ErrorState
                    error={error}
                    retry={() => {
                        setError(undefined);
                        void refreshProfile().catch(setError);
                    }}
                />
                <Button
                    title={t("auth.signOut")}
                    onPress={accountsContext.signOut}
                />
            </Screen>
        );
    if (!profile || !drafts)
        return (
            <Screen title="TrainFlow">
                <LoadingState />
            </Screen>
        );
    if (!profile.onboarded)
        return <Onboarding api={api} onComplete={refreshProfile} />;
    const allowedRole =
        role === "coach" && profile.contexts.includes("Coach")
            ? "coach"
            : "client";
    return (
        <MobileContext.Provider
            value={{
                api,
                accountId: account.session.user.id,
                profile,
                drafts,
                role: allowedRole,
                accountSignal: scope.controller.signal,
                getAccessToken,
                refreshProfile,
                setRole: (next) => {
                    if (next === "coach" && !profile.contexts.includes("Coach"))
                        return;
                    // Queries are keyed by role, so each view keeps its cache and the switch
                    // shows the last known data at once while it refreshes.
                    updateRole(next);
                    void SecureStore.setItemAsync(
                        `role.${account.session.user.id}`,
                        next,
                    );
                },
            }}
        >
            <QueryClientProvider client={scope.query}>
                {children}
            </QueryClientProvider>
        </MobileContext.Provider>
    );
}

function AuthScreen({
    accounts,
    onSignedIn,
    onCancel,
}: {
    accounts: Account[];
    onSignedIn: (slot: number, session?: Session) => Promise<void>;
    onCancel?: () => void;
}) {
    const { t, locale, setLocale } = useI18n();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirmation, setConfirmation] = useState("");
    const [register, setRegister] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>();
    const [notice, setNotice] = useState("");
    const lock = useRef(false);
    const { requestPasswordReset } = useAccounts();
    const existing = accounts.find(
        (item) =>
            item.session.user.email?.toLowerCase() ===
            email.trim().toLowerCase(),
    );
    const slot =
        !register && existing
            ? existing.slot
            : [0, 1, 2].find(
                  (value) => !accounts.some((item) => item.slot === value),
              );
    async function submit() {
        if (lock.current || slot === undefined || !email.trim() || !password)
            return;
        if (register && password !== confirmation) {
            setError(Error(t("auth.passwordMismatch")));
            return;
        }
        lock.current = true;
        setBusy(true);
        setError(undefined);
        setNotice("");
        try {
            const pending = register
                ? await authAttempts.begin(slot, email, "confirmation")
                : null;
            const result = register
                ? await client(slot).auth.signUp({
                      email: email.trim(),
                      password,
                      options: { emailRedirectTo: pending!.redirectTo },
                  })
                : await client(slot).auth.signInWithPassword({
                      email: email.trim(),
                      password,
                  });
            if (result.error) throw result.error;
            if (result.data.session) {
                await authAttempts.cancel(slot);
                await onSignedIn(slot, result.data.session);
            } else setNotice(t("auth.confirmationNotice"));
        } catch (failure) {
            if (register) await authAttempts.cancel(slot).catch(() => {});
            setError(failure);
        } finally {
            lock.current = false;
            setBusy(false);
        }
    }
    async function reset() {
        if (lock.current || !email.trim()) return;
        lock.current = true;
        setBusy(true);
        setError(undefined);
        try {
            await requestPasswordReset(email);
            setNotice(t("auth.recoveryNotice"));
        } catch (failure) {
            setError(failure);
        } finally {
            lock.current = false;
            setBusy(false);
        }
    }
    return (
        <Screen
            title={t(register ? "auth.create" : "auth.signIn")}
            subtitle="TrainFlow"
        >
            {accounts.length > 0 && (
                <Section>
                    {accounts.map((item) => (
                        <ListItem
                            key={item.slot}
                            icon="person"
                            title={
                                item.session.user.email ||
                                t("auth.accountNumber", {
                                    number: item.slot + 1,
                                })
                            }
                            onPress={
                                busy ? undefined : () => onSignedIn(item.slot)
                            }
                        />
                    ))}
                </Section>
            )}
            {slot === undefined ? (
                <Text tone="mutedText">{t("auth.maxAccounts")}</Text>
            ) : (
                <Section flat>
                    <Field
                        label={t("auth.email")}
                        keyboardType="email-address"
                        autoCapitalize="none"
                        autoComplete="email"
                        editable={!busy}
                        value={email}
                        onChangeText={setEmail}
                    />
                    <Field
                        label={t("auth.password")}
                        secureTextEntry
                        autoComplete={
                            register ? "new-password" : "current-password"
                        }
                        editable={!busy}
                        value={password}
                        onChangeText={setPassword}
                    />
                    {register && (
                        <Field
                            label={t("auth.confirmPassword")}
                            secureTextEntry
                            autoComplete="new-password"
                            editable={!busy}
                            value={confirmation}
                            onChangeText={setConfirmation}
                            error={
                                confirmation && confirmation !== password
                                    ? t("auth.passwordMismatch")
                                    : undefined
                            }
                        />
                    )}
                    {!!notice && (
                        <Text variant="caption" tone="success">
                            {notice}
                        </Text>
                    )}
                    {!!error && <ErrorState error={error} />}
                    <Button
                        size="lg"
                        tone="primary"
                        title={t(register ? "auth.create" : "auth.signIn")}
                        loading={busy}
                        disabled={
                            !email ||
                            !password ||
                            (register && password !== confirmation)
                        }
                        onPress={submit}
                    />
                    <Button
                        tone="ghost"
                        title={t(
                            register ? "auth.existingAccount" : "auth.create",
                        )}
                        disabled={busy}
                        onPress={() => {
                            setRegister(!register);
                            setError(undefined);
                            setNotice("");
                        }}
                    />
                    {!register && (
                        <Button
                            tone="ghost"
                            size="sm"
                            title={t("auth.forgot")}
                            disabled={busy || !email.trim()}
                            onPress={reset}
                        />
                    )}
                </Section>
            )}
            {slot === undefined && !!notice && <Text>{notice}</Text>}
            {slot === undefined && !!error && <ErrorState error={error} />}
            <SegmentedControl
                label="Language / Język"
                disabled={busy}
                value={locale}
                options={[
                    { value: "en", label: "English" },
                    { value: "pl", label: "Polski" },
                ]}
                onChange={async (next) => {
                    try {
                        await setLocale(next);
                    } catch (failure) {
                        setError(failure);
                    }
                }}
            />
            {onCancel && (
                <Button
                    title={t("common.cancel")}
                    disabled={busy}
                    onPress={onCancel}
                />
            )}
        </Screen>
    );
}
function PasswordRecovery({
    recovery,
    onDone,
    onCancel,
}: {
    recovery: {
        slot: number;
        userId: string;
        email: string;
        expiresAt: number;
    };
    onDone: () => Promise<void>;
    onCancel: () => Promise<void>;
}) {
    const { t } = useI18n();
    const [password, setPassword] = useState("");
    const [confirmation, setConfirmation] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>();
    const lock = useRef(false);
    async function save() {
        if (lock.current || !password || password !== confirmation) return;
        lock.current = true;
        setBusy(true);
        setError(undefined);
        try {
            if (Date.now() >= recovery.expiresAt)
                throw Error(t("auth.recoveryExpired"));
            const auth = client(recovery.slot).auth;
            const current = await auth.getSession();
            if (current.error) throw current.error;
            if (current.data.session?.user.id !== recovery.userId)
                throw Error(t("auth.recoveryChanged"));
            const result = await auth.updateUser({ password });
            if (result.error) throw result.error;
            if (result.data.user?.id !== recovery.userId)
                throw Error(t("auth.recoveryChanged"));
            setPassword("");
            setConfirmation("");
            await onDone();
        } catch (failure) {
            setError(failure);
        } finally {
            lock.current = false;
            setBusy(false);
        }
    }
    return (
        <Screen title={t("auth.setPassword")}>
            <Text tone="mutedText">{recovery.email}</Text>
            <Field
                label={t("auth.newPassword")}
                secureTextEntry
                autoComplete="new-password"
                editable={!busy}
                value={password}
                onChangeText={setPassword}
            />
            <Field
                label={t("auth.confirmNewPassword")}
                secureTextEntry
                autoComplete="new-password"
                editable={!busy}
                value={confirmation}
                onChangeText={setConfirmation}
                error={
                    confirmation && confirmation !== password
                        ? t("auth.passwordMismatch")
                        : undefined
                }
            />
            <Button
                size="lg"
                tone="primary"
                title={t("auth.savePassword")}
                loading={busy}
                disabled={!password || password !== confirmation}
                onPress={save}
            />
            <Button
                tone="ghost"
                title={t("auth.cancelRecovery")}
                disabled={busy}
                onPress={async () => {
                    if (lock.current) return;
                    lock.current = true;
                    setBusy(true);
                    try {
                        await onCancel();
                    } catch (failure) {
                        setError(failure);
                    } finally {
                        lock.current = false;
                        setBusy(false);
                    }
                }}
            />
            {!!error && <ErrorState error={error} />}
        </Screen>
    );
}
function Onboarding({
    api,
    onComplete,
}: {
    api: Transport;
    onComplete: () => Promise<void>;
}) {
    const { t, locale } = useI18n();
    const [username, setUsername] = useState("");
    const [name, setName] = useState("");
    const [birth, setBirth] = useState("");
    const [coach, setCoach] = useState(false);
    const [terms, setTerms] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>();
    return (
        <Screen title={t("onboarding.title")}>
            <Field
                label={t("onboarding.username")}
                autoCapitalize="none"
                value={username}
                onChangeText={setUsername}
            />
            <Field
                label={t("settings.fullName")}
                value={name}
                onChangeText={setName}
            />
            <Field
                label={t("onboarding.birth")}
                placeholder="YYYY-MM-DD"
                keyboardType="numbers-and-punctuation"
                value={birth}
                onChangeText={setBirth}
            />
            <Section>
                <ListItem
                    title={t("onboarding.coach")}
                    trailing={
                        <Switch
                            accessibilityLabel={t("onboarding.coach")}
                            value={coach}
                            onValueChange={setCoach}
                        />
                    }
                />
                <ListItem
                    title={t("onboarding.terms")}
                    trailing={
                        <Switch
                            accessibilityLabel={t("onboarding.acceptTerms")}
                            value={terms}
                            onValueChange={setTerms}
                        />
                    }
                />
            </Section>
            <Button
                size="lg"
                tone="primary"
                title={t("common.continue")}
                loading={busy}
                disabled={
                    !terms ||
                    !username ||
                    !name ||
                    !/^\d{4}-\d{2}-\d{2}$/.test(birth)
                }
                onPress={async () => {
                    setBusy(true);
                    try {
                        await api({
                            path: "/api/v1/me/onboarding",
                            method: "PUT",
                            json: {
                                username,
                                displayName: name,
                                birthDate: birth,
                                acceptedTerms: terms,
                                locale,
                                timeZone:
                                    Intl.DateTimeFormat().resolvedOptions()
                                        .timeZone,
                                role: coach ? "Coach" : "Client",
                            },
                        });
                        await onComplete();
                    } catch (failure) {
                        setError(failure);
                    } finally {
                        setBusy(false);
                    }
                }}
            />
            {!!error && <ErrorState error={error} />}
        </Screen>
    );
}
