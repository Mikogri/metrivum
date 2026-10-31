import type { AuthChangeEvent, Session, SupabaseClient } from "@supabase/supabase-js";
import { StaleAccountError } from "../http/errors";
import { authClient } from "./supabase";
import { ACTIVE_SLOT_STORAGE_KEY, forgetSlot, SLOT_IDS, slotStorageKey, type SlotId } from "./storage-keys";

export interface SignedInAccount {
  slot: SlotId;
  userId: string;
  email: string | null;
  session: Session;
}

export interface SessionState {
  /** `loading` until stored sessions have been read and refreshed if needed. */
  phase: "loading" | "ready";
  accounts: SignedInAccount[];
  activeSlot: SlotId | null;
  /** Bumped on every switch so dependants can tell accounts apart even for the same slot. */
  generation: number;
}

type Listener = () => void;

function readActiveSlotPreference(): SlotId | null {
  try {
    const value = window.sessionStorage.getItem(ACTIVE_SLOT_STORAGE_KEY) ?? window.localStorage.getItem(ACTIVE_SLOT_STORAGE_KEY);
    const slot = Number(value);
    return (SLOT_IDS as readonly number[]).includes(slot) ? (slot as SlotId) : null;
  } catch {
    return null;
  }
}

function writeActiveSlotPreference(slot: SlotId | null) {
  try {
    if (slot === null) {
      window.sessionStorage.removeItem(ACTIVE_SLOT_STORAGE_KEY);
      return;
    }
    // Per tab first, so two tabs can show different accounts; localStorage remembers the last choice.
    window.sessionStorage.setItem(ACTIVE_SLOT_STORAGE_KEY, String(slot));
    window.localStorage.setItem(ACTIVE_SLOT_STORAGE_KEY, String(slot));
  } catch {
    // Storage may be unavailable; the active account then lasts for this page only.
  }
}

function hasStoredSession(slot: SlotId): boolean {
  try {
    return window.localStorage.getItem(slotStorageKey(slot)) !== null;
  } catch {
    return false;
  }
}

/**
 * Up to three independent Supabase sessions in one browser. Each slot has its own client and
 * storage key; the manager only decides which one the UI shows in this tab.
 */
export class SessionManager {
  private state: SessionState = { phase: "loading", accounts: [], activeSlot: null, generation: 0 };
  private listeners = new Set<Listener>();
  private subscriptions = new Map<SlotId, () => void>();
  private refreshes = new Map<string, Promise<Session | null>>();
  private authEventVersions = new Map<SlotId, number>();
  private started = false;
  private readonly clientFor: (slot: SlotId) => SupabaseClient;

  constructor(clientFor: (slot: SlotId) => SupabaseClient = authClient) {
    this.clientFor = clientFor;
  }

  getState = (): SessionState => this.state;

  subscribe = (listener: Listener) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private setState(patch: Partial<SessionState>) {
    const next = { ...this.state, ...patch };
    const previousUser = this.state.accounts.find(a => a.slot === this.state.activeSlot)?.userId;
    const nextUser = next.accounts.find(a => a.slot === next.activeSlot)?.userId;
    if (patch.generation === undefined && previousUser !== nextUser) next.generation++;
    this.state = next;
    for (const listener of this.listeners) listener();
  }

  async start() {
    if (this.started) return;
    this.started = true;
    const accounts: SignedInAccount[] = [];
    for (const slot of SLOT_IDS) {
      if (!hasStoredSession(slot)) continue;
      const client = this.clientFor(slot);
      this.watch(slot, client);
      // getSession refreshes an expired access token using the stored refresh token.
      const { data } = await client.auth.getSession();
      if (!data.session || data.session.user.is_anonymous) continue;
      // A saved JWT can outlive deletion. Only Auth may confirm which user this slot represents.
      const verified = await client.auth.getUser(data.session.access_token);
      if (verified.error) {
        if ([400, 401, 403, 404].includes(verified.error.status ?? 0)) {
          await client.auth.signOut({ scope: "local" });
          forgetSlot(slot);
        }
        continue; // Network errors retain stored credentials for a later attempt, but grant no session.
      }
      if (!verified.data.user || verified.data.user.id !== data.session.user.id || verified.data.user.is_anonymous) {
        await client.auth.signOut({ scope: "local" });
        forgetSlot(slot);
        continue;
      }
      if (!accounts.some(account => account.userId === verified.data.user.id))
        accounts.push(toAccount(slot, { ...data.session, user: verified.data.user }));
    }
    const preferred = readActiveSlotPreference();
    const activeSlot = accounts.find((a) => a.slot === preferred)?.slot ?? accounts[0]?.slot ?? null;
    writeActiveSlotPreference(activeSlot);
    this.setState({ phase: "ready", accounts, activeSlot, generation: this.state.generation + 1 });
  }

  /**
   * Asks Auth again whether every signed-in account still exists. An account deleted elsewhere (another tab, the
   * dashboard, the development eraser) keeps a valid-looking JWT in this browser until then; this signs it out and
   * removes its stored session. Network errors keep the account.
   */
  async revalidate() {
    if (this.state.phase !== "ready") return;
    for (const account of [...this.state.accounts]) {
      const client = this.clientFor(account.slot);
      const { data } = await client.auth.getSession();
      if (!data.session) continue;
      const verified = await client.auth.getUser(data.session.access_token);
      const gone = verified.error ? [400, 401, 403, 404].includes(verified.error.status ?? 0) : verified.data.user?.id !== account.userId;
      if (gone) {
        await this.signOut(account.slot);
        forgetSlot(account.slot);
      }
    }
  }

  /** Keeps the account list in sync with refreshes, sign-outs and other tabs. */
  private watch(slot: SlotId, client: SupabaseClient) {
    if (this.subscriptions.has(slot)) return;
    const { data } = client.auth.onAuthStateChange((event: AuthChangeEvent, session: Session | null) => {
      if (this.state.phase === "loading" && event === "INITIAL_SESSION") return;
      const version = (this.authEventVersions.get(slot) ?? 0) + 1;
      this.authEventVersions.set(slot, version);
      // Defer: Supabase forbids awaiting other auth calls inside this callback.
      setTimeout(() => { void this.onAuthEvent(slot, event, session, version); }, 0);
    });
    this.subscriptions.set(slot, () => data.subscription.unsubscribe());
  }

  private async onAuthEvent(slot: SlotId, event: AuthChangeEvent, session: Session | null, version: number) {
    if (this.authEventVersions.get(slot) !== version) return;
    // Only an explicit sign-out removes an account. Supabase also reports "no session" as INITIAL_SESSION
    // (and on lock or storage errors) while a fresh sign-in in this slot is still being saved.
    if (!session && event !== "SIGNED_OUT") return;
    if (!session || event === "SIGNED_OUT") {
      const accounts = this.state.accounts.filter((a) => a.slot !== slot);
      const wasActive = this.state.activeSlot === slot;
      const activeSlot = wasActive ? null : this.state.activeSlot;
      if (wasActive) writeActiveSlotPreference(null);
      this.setState({ accounts, activeSlot, generation: wasActive ? this.state.generation + 1 : this.state.generation });
      return;
    }
    if (session.user.is_anonymous) return;
    if (!this.state.accounts.some(account => account.slot === slot && account.userId === session.user.id)) {
      const verified = await this.clientFor(slot).auth.getUser(session.access_token);
      if (this.authEventVersions.get(slot) !== version || verified.error
        || verified.data.user?.id !== session.user.id || verified.data.user.is_anonymous) return;
    }
    const next = toAccount(slot, session);
    // Another saved slot is not a second identity for the same Auth subject.
    if (this.state.accounts.some(account => account.slot !== slot && account.userId === next.userId)) return;
    const exists = this.state.accounts.some((a) => a.slot === slot);
    const accounts = exists ? this.state.accounts.map((a) => (a.slot === slot ? next : a)) : [...this.state.accounts, next];
    this.setState({ accounts });
  }

  client(slot: SlotId): SupabaseClient {
    const client = this.clientFor(slot);
    this.watch(slot, client);
    return client;
  }

  /** Slot for a new sign-in: an explicit valid request, else the first free slot. */
  slotForNewSignIn(requested?: number | null): SlotId | null {
    if (requested !== undefined && requested !== null && (SLOT_IDS as readonly number[]).includes(requested)) return requested as SlotId;
    return SLOT_IDS.find((slot) => !this.state.accounts.some((a) => a.slot === slot)) ?? null;
  }

  /** Records a fresh sign-in in `slot`. If that person is already signed in elsewhere, keeps one copy. */
  async completeSignIn(slot: SlotId, session: Session): Promise<SlotId> {
    // A re-created Auth account may use the old email, but its ID and data must stay separate.
    const address = session.user.email?.trim().toLowerCase();
    for (const old of this.state.accounts.filter(a => a.slot !== slot && a.userId !== session.user.id
      && address && a.email?.trim().toLowerCase() === address)) await this.signOut(old.slot);
    const duplicate = this.state.accounts.find((a) => a.userId === session.user.id && a.slot !== slot);
    if (duplicate) {
      await this.clientFor(slot).auth.signOut({ scope: "local" });
      this.activate(duplicate.slot);
      return duplicate.slot;
    }
    const others = this.state.accounts.filter((a) => a.slot !== slot);
    this.setState({ accounts: [...others, toAccount(slot, session)] });
    this.activate(slot);
    return slot;
  }

  /** Switches the account shown in this tab. Callers must have handled unsaved work first. */
  activate(slot: SlotId) {
    if (this.state.activeSlot === slot) return;
    writeActiveSlotPreference(slot);
    this.setState({ activeSlot: slot, generation: this.state.generation + 1 });
  }

  /** Signs one account out of this browser without touching the others. */
  async signOut(slot: SlotId) {
    this.authEventVersions.set(slot, (this.authEventVersions.get(slot) ?? 0) + 1);
    try {
      await this.clientFor(slot).auth.signOut({ scope: "local" });
    } finally {
      const accounts = this.state.accounts.filter((a) => a.slot !== slot);
      const wasActive = this.state.activeSlot === slot;
      const activeSlot = wasActive ? (accounts[0]?.slot ?? null) : this.state.activeSlot;
      writeActiveSlotPreference(activeSlot);
      this.setState({ accounts, activeSlot, generation: wasActive ? this.state.generation + 1 : this.state.generation });
    }
  }

  async accessToken(slot: SlotId, forceRefresh = false, expectedUserId?: string): Promise<string | null> {
    const client = this.clientFor(slot);
    let session: Session | null;
    if (forceRefresh) {
      const key = `${slot}:${this.state.accounts.find(a => a.slot === slot)?.userId ?? ""}`;
      let pending = this.refreshes.get(key);
      if (!pending) {
        pending = client.auth.refreshSession()
          .then(({ data, error }) => error ? null : data.session)
          .finally(() => this.refreshes.delete(key));
        this.refreshes.set(key, pending);
      }
      session = await pending;
    } else {
      const { data } = await client.auth.getSession();
      session = data.session;
    }
    // Auth events are deferred; the SDK can already contain another user's session.
    if (session && expectedUserId !== undefined && session.user.id !== expectedUserId) throw new StaleAccountError();
    return session?.access_token ?? null;
  }
}

function toAccount(slot: SlotId, session: Session): SignedInAccount {
  return { slot, userId: session.user.id, email: session.user.email ?? null, session };
}

let singleton: SessionManager | null = null;
export function sessionManager(): SessionManager {
  if (!singleton) singleton = new SessionManager();
  return singleton;
}
