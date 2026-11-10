import { expect, it } from "vitest";
import { createChunkStorage } from "./chunk-storage";
it("stores long Unicode sessions in bounded atomic chunks and cleans them on removal", async () => {
  const data = new Map<string, string>();
  const storage = createChunkStorage(
    {
      getItem: async (k) => data.get(k) ?? null,
      setItem: async (k, v) => {
        expect(new TextEncoder().encode(v).length).toBeLessThan(2048);
        data.set(k, v);
      },
      removeItem: async (k) => {
        data.delete(k);
      },
    },
    () => "generation",
  );
  const value = "🔑".repeat(4000);
  await storage.setItem("auth", value);
  expect(await storage.getItem("auth")).toBe(value);
  await storage.removeItem("auth");
  expect(data.size).toBe(0);
});
it("does not replace a readable session after an incomplete write", async () => {
  const data = new Map<string, string>();
  let generation = 0;
  let fail = false;
  const storage = createChunkStorage(
    {
      getItem: async (k) => data.get(k) ?? null,
      setItem: async (k, v) => {
        if (fail && k.includes(".chunk.")) throw Error("Full");
        data.set(k, v);
      },
      removeItem: async (k) => {
        data.delete(k);
      },
    },
    () => String(++generation),
  );
  await storage.setItem("auth", "original");
  fail = true;
  await expect(storage.setItem("auth", "replacement")).rejects.toThrow("Full");
  expect(await storage.getItem("auth")).toBe("original");
});
