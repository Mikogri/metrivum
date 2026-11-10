export interface KeyStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}
type Manifest = { generation: string; count: number };
const MAX_CHUNKS = 192;
function parse(value: string | null): Manifest | null {
  if (!value) return null;
  try {
    const manifest = JSON.parse(value) as Manifest;
    return /^[a-zA-Z0-9-]+$/.test(manifest.generation) &&
      Number.isInteger(manifest.count) &&
      manifest.count > 0 &&
      manifest.count <= MAX_CHUNKS
      ? manifest
      : null;
  } catch {
    return null;
  }
}
export function createChunkStorage(
  storage: KeyStorage,
  generation: () => string,
): KeyStorage {
  const pending = new Map<string, Promise<unknown>>();
  function exclusive<T>(key: string, work: () => Promise<T>): Promise<T> {
    const task = (pending.get(key) ?? Promise.resolve())
      .catch(() => {})
      .then(work);
    pending.set(key, task);
    void task
      .finally(() => {
        if (pending.get(key) === task) pending.delete(key);
      })
      .catch(() => {});
    return task;
  }
  const chunkKey = (key: string, m: Manifest, index: number) =>
    `${key}.chunk.${m.generation}.${index}`;
  async function clean(key: string, manifest: Manifest | null) {
    if (manifest)
      await Promise.all(
        Array.from({ length: manifest.count }, (_, i) =>
          storage.removeItem(chunkKey(key, manifest, i)),
        ),
      );
  }
  return {
    getItem: (key) =>
      exclusive(key, async () => {
        const manifest = parse(await storage.getItem(key));
        if (!manifest) return null;
        const parts = await Promise.all(
          Array.from({ length: manifest.count }, (_, i) =>
            storage.getItem(chunkKey(key, manifest, i)),
          ),
        );
        return parts.some((part) => part === null) ? null : parts.join("");
      }),
    setItem: (key, value) =>
      exclusive(key, async () => {
        // 500 UTF-16 units fit below SecureStore's 2 KiB limit even as UTF-8.
        if (value.length > MAX_CHUNKS * 500)
          throw Error("Session exceeds secure storage limit.");
        const previous = parse(await storage.getItem(key));
        const points = Array.from(value);
        const chunks = Array.from(
          { length: Math.max(1, Math.ceil(points.length / 500)) },
          (_, i) => points.slice(i * 500, (i + 1) * 500).join(""),
        );
        const manifest = {
          generation: generation(),
          count: chunks.length,
        };
        if (!/^[a-zA-Z0-9-]+$/.test(manifest.generation))
          throw Error("Invalid storage generation.");
        try {
          for (let i = 0; i < manifest.count; i++)
            await storage.setItem(chunkKey(key, manifest, i), chunks[i]!);
          // Publish only after every chunk was written. The previous session survives failed writes.
          await storage.setItem(key, JSON.stringify(manifest));
        } catch (error) {
          await clean(key, manifest).catch(() => {});
          throw error;
        }
        await clean(key, previous).catch(() => {});
      }),
    removeItem: (key) =>
      exclusive(key, async () => {
        const manifest = parse(await storage.getItem(key));
        await storage.removeItem(key);
        await clean(key, manifest);
      }),
  };
}
