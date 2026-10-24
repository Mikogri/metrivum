import * as SQLite from "expo-sqlite";
import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";

export interface Draft<T> {
    value: T;
    version: number;
    updatedAt: number;
}
export interface DraftStore {
    get<T>(key: string): Promise<Draft<T> | null>;
    put<T>(key: string, value: T, version: number): Promise<void>;
    remove(key: string): Promise<void>;
}
const TTL = 7 * 24 * 60 * 60 * 1000;
export async function openDraftStore(accountId: string) {
    if (!/^[a-f0-9-]{36}$/i.test(accountId))
        throw Error("Invalid account identifier.");
    const keyName = `draft-key.${accountId}`;
    let key = await SecureStore.getItemAsync(keyName);
    if (!key) {
        key = Array.from(await Crypto.getRandomBytesAsync(32), (byte) =>
            byte.toString(16).padStart(2, "0"),
        ).join("");
        await SecureStore.setItemAsync(keyName, key, {
            keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
        });
    }
    if (!/^[a-f0-9]{64}$/.test(key))
        throw Error("Invalid draft encryption key.");
    const name = `drafts-${accountId}.db`;
    const db = await SQLite.openDatabaseAsync(name);
    try {
        await db.execAsync(`PRAGMA key = "x'${key}'";`);
        const cipher = await db.getFirstAsync<Record<string, unknown>>(
            "PRAGMA cipher_version",
        );
        if (!cipher || !Object.values(cipher).some(Boolean))
            throw Error(
                "Encrypted storage requires the Metrivum development build.",
            );
        await db.execAsync(
            "CREATE TABLE IF NOT EXISTS drafts (key TEXT PRIMARY KEY, payload TEXT NOT NULL, version INTEGER NOT NULL, updated INTEGER NOT NULL);",
        );
        await db.runAsync(
            "DELETE FROM drafts WHERE updated < ?",
            Date.now() - TTL,
        );
    } catch (error) {
        await db.closeAsync();
        throw error;
    }
    let closed = false;
    let tail: Promise<unknown> = Promise.resolve();
    function serial<T>(work: () => Promise<T>): Promise<T> {
        if (closed) return Promise.reject(Error("Account storage is closed."));
        const task = tail.catch(() => {}).then(work);
        tail = task;
        return task;
    }
    const store: DraftStore = {
        get: <T>(key: string) =>
            serial(async () => {
                const row = await db.getFirstAsync<{
                    payload: string;
                    version: number;
                    updated: number;
                }>(
                    "SELECT payload, version, updated FROM drafts WHERE key = ? AND updated >= ?",
                    key,
                    Date.now() - TTL,
                );
                return row
                    ? {
                          value: JSON.parse(row.payload) as T,
                          version: row.version,
                          updatedAt: row.updated,
                      }
                    : null;
            }),
        put: (key, value, version) =>
            serial(async () => {
                const payload = JSON.stringify(value);
                if (payload.length > 64 * 1024)
                    throw Error("Draft is too large to store on this device.");
                await db.runAsync(
                    "INSERT INTO drafts(key,payload,version,updated) VALUES(?,?,?,?) ON CONFLICT(key) DO UPDATE SET payload=excluded.payload,version=excluded.version,updated=excluded.updated",
                    key,
                    payload,
                    version,
                    Date.now(),
                );
                await db.execAsync(
                    "DELETE FROM drafts WHERE key NOT IN (SELECT key FROM drafts ORDER BY updated DESC LIMIT 100)",
                );
            }),
        remove: (key) =>
            serial(async () => {
                await db.runAsync("DELETE FROM drafts WHERE key = ?", key);
            }),
    };
    let closing: Promise<void> | undefined;
    let wiped = false;
    return {
        store,
        close: async (wipe = false) => {
            closed = true;
            closing ??= tail.catch(() => {}).then(() => db.closeAsync());
            await closing;
            if (wipe && !wiped) {
                await SQLite.deleteDatabaseAsync(name);
                await SecureStore.deleteItemAsync(keyName);
                wiped = true;
            }
        },
    };
}
