import { expect, it, vi } from "vitest";
import { enqueueJob, jobResult, listJobs, removeJob } from "./local-analysis";

const tracking = {
  timestampSeconds: 0,
  videoWidth: 100,
  videoHeight: 100,
  points: [
    { x: 1, y: 2 },
    { x: 3, y: 4 },
  ],
};

it("queues the video only on the fixed loopback analyzer, with the pairing token and any-language names", async () => {
  const fetcher = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ id: "job", state: "queued" }), {
      status: 201,
    }),
  );
  const controller = new AbortController();
  const file = new File(["video"], "lift.mov");
  await enqueueJob(
    file,
    {
      name: "Przysiad – ciężki",
      account: "user-1",
      movement: "squat",
      tracking,
      sourceVideo: { durationSeconds: 3, width: 100, height: 100 },
    },
    "pairing-token",
    controller.signal,
    fetcher,
  );
  const [url, request] = fetcher.mock.calls[0]!;
  expect(url).toBe("http://127.0.0.1:59121/jobs");
  expect(request.body).toBe(file);
  expect(request.signal).toBe(controller.signal);
  expect(request.credentials).toBe("omit");
  expect(request.headers.Authorization).toBe("Bearer pairing-token");
  expect(request.headers["Content-Type"]).toBe("video/quicktime");
  expect(
    JSON.parse(decodeURIComponent(request.headers["X-Metrivum-Job"])),
  ).toMatchObject({
    name: "Przysiad – ciężki",
    account: "user-1",
    fileName: "lift.mov",
  });
});

it("lists only the signed-in user's jobs and explains a full queue", async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(new Response("[]"));
  await listJobs("token", "user 1", new AbortController().signal, fetcher);
  expect(fetcher.mock.calls[0]![0]).toBe(
    "http://127.0.0.1:59121/jobs?account=user%201",
  );
  const full = vi
    .fn()
    .mockResolvedValue(
      new Response(
        JSON.stringify({ detail: "The analyzer already holds 10 videos." }),
        { status: 409 },
      ),
    );
  await expect(
    enqueueJob(
      new File(["x"], "v.mp4"),
      {} as never,
      "token",
      new AbortController().signal,
      full,
    ),
  ).rejects.toThrow("10 videos");
});

it("rejects results it does not understand and treats an already removed job as removed", async () => {
  const bad = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify({ schemaVersion: 2 })));
  await expect(
    jobResult("token", "job", new AbortController().signal, bad),
  ).rejects.toThrow("Unsupported");
  const gone = vi.fn().mockResolvedValue(new Response("", { status: 404 }));
  await expect(
    removeJob("token", "job", new AbortController().signal, gone),
  ).resolves.toBeUndefined();
});
