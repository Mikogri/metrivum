import { hashKey, type QueryClient, type QueryKey } from "@tanstack/react-query";

type Operation = { apply: (value: unknown, applied: Set<string>) => unknown; pending: boolean };
type Entry = { baseline: unknown; expected: unknown; operations: Operation[] };
const journals = new WeakMap<QueryClient, Map<string, Entry>>();

export function readBaseline<T>(cache: QueryClient, key: QueryKey): T | undefined {
  const entry = journals.get(cache)?.get(hashKey(key));
  const current = cache.getQueryData<T>(key);
  return entry && entry.expected === current ? entry.baseline as T : current;
}

/** Keep successful reads while replaying pending reads from the last authoritative value. */
export function journalRead<T>(cache: QueryClient, updates: { key: QueryKey; apply: (value: T, applied: Set<string>) => T }[]) {
  let journal = journals.get(cache);
  if (!journal) { journal = new Map(); journals.set(cache, journal); }
  const owned = updates.flatMap(({ key, apply }) => {
    const value = cache.getQueryData<T>(key);
    if (value === undefined) return [];
    const hash = hashKey(key);
    let entry = journal.get(hash);
    if (!entry || entry.expected !== value) {
      entry = { baseline: value, expected: value, operations: [] };
      journal.set(hash, entry);
    }
    const operation: Operation = { apply: (current, applied) => apply(current as T, applied), pending: true };
    entry.operations.push(operation);
    const applied = new Set<string>();
    cache.setQueryData(key, entry.operations.reduce((current, op) => op.apply(current, applied), entry.baseline));
    entry.expected = cache.getQueryData(key);
    return [{ key, hash, entry, operation }];
  });
  let settled = false;
  const settle = (success: boolean) => {
    if (settled) return;
    settled = true;
    for (const { key, hash, entry, operation } of owned) {
      if (journal.get(hash) !== entry) continue;
      if (cache.getQueryData(key) !== entry.expected) { journal.delete(hash); continue; }
      if (success) operation.pending = false;
      else entry.operations = entry.operations.filter(op => op !== operation);
      const applied = new Set<string>();
      cache.setQueryData(key, entry.operations.reduce((current, op) => op.apply(current, applied), entry.baseline));
      entry.expected = cache.getQueryData(key);
      if (!entry.operations.some(op => op.pending)) journal.delete(hash);
    }
  };
  return Object.assign(() => settle(false), { commit: () => settle(true) });
}
