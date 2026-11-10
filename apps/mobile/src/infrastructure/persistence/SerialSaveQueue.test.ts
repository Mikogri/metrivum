import { expect, it } from "vitest";
import { SerialSaveQueue } from "./SerialSaveQueue";
it("serializes versions and waits for every persisted edit before finishing", async () => {
  const versions: number[] = [];
  const local: string[] = [];
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const queue = new SerialSaveQueue<string>(
    3,
    async (value) => {
      local.push(value);
    },
    async (_value, version) => {
      versions.push(version);
      if (version === 3) await gate;
      return version + 1;
    },
  );
  const first = queue.enqueue("first");
  const second = queue.enqueue("second");
  let finished = false;
  const finish = queue.flush().then(() => {
    finished = true;
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(finished).toBe(false);
  expect(local).toEqual(["first", "second"]);
  release();
  await Promise.all([first, second, finish]);
  expect(versions).toEqual([3, 4]);
  expect(local.at(-1)).toBe("second");
  expect(queue.version).toBe(5);
});
it("preserves local work and stops subsequent writes after a conflict", async () => {
  const values: string[] = [];
  let sends = 0;
  const queue = new SerialSaveQueue(
    1,
    async (value: string) => {
      values.push(value);
    },
    async () => {
      sends++;
      throw new Error("Version conflict");
    },
  );
  await expect(queue.enqueue("a")).rejects.toThrow("Version conflict");
  await expect(queue.enqueue("b")).rejects.toThrow("Version conflict");
  await expect(queue.flush()).rejects.toThrow("Version conflict");
  expect(sends).toBe(1);
  expect(values).toEqual(["a", "b"]);
});

it("registers the whole local backlog before account storage closes", async () => {
  let closed = false;
  let release!: () => void;
  const writes: string[] = [];
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const queue = new SerialSaveQueue(
    1,
    async (value: string) => {
      if (closed) throw Error("Account storage is closed");
      writes.push(value);
      await gate;
    },
    async () => {
      throw Error("Account request aborted");
    },
  );
  const first = queue.enqueue("first").catch(() => {});
  const second = queue.enqueue("latest").catch(() => {});
  closed = true;
  expect(writes).toEqual(["first", "latest"]);
  release();
  await Promise.all([first, second]);
});
