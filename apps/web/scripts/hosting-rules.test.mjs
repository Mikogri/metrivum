import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { copyFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { get, createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { classify } from "./hosting-rules.mjs";

test("malformed percent encoding is not a route and never reaches the filesystem", () => {
  for (const path of ["/%ZZ", "/app/%", "/%E0%A4%A"]) {
    assert.deepEqual(classify(path, () => { assert.fail("Malformed path reached the filesystem"); }), { kind: "not-found" });
  }
});

function request(port, path) {
  return new Promise((resolve, reject) => {
    const req = get({ hostname: "127.0.0.1", port, path }, res => {
      let body = "";
      res.on("data", chunk => { body += chunk; });
      res.on("end", () => resolve({ status: res.statusCode, body }));
    });
    req.on("error", reject);
  });
}

test("the preview server stays healthy after malformed request targets", { timeout: 10000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), "trainflow-hosting-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await mkdir(join(directory, "scripts"));
  await mkdir(join(directory, "build/client/404"), { recursive: true });
  await writeFile(join(directory, "build/client/index.html"), "Healthy landing");
  await writeFile(join(directory, "build/client/404/index.html"), "Not found");
  for (const file of ["serve.mjs", "hosting-rules.mjs"]) {
    await copyFile(new URL(file, import.meta.url), join(directory, "scripts", file));
  }
  const probe = createServer();
  probe.listen(0, "127.0.0.1");
  await once(probe, "listening");
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  const server = spawn(process.execPath, [join(directory, "scripts/serve.mjs")], {
    env: { ...process.env, PORT: String(port) }, windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(async () => { if (server.exitCode === null) { server.kill(); await once(server, "exit"); } });
  await Promise.race([
    once(server.stdout, "data"),
    once(server, "exit").then(() => { throw new Error("Server exited before listening"); }),
  ]);
  for (const path of ["/%ZZ", "/app/%", "//["]) {
    assert.equal((await request(port, path)).status, 404);
    assert.deepEqual(await request(port, "/"), { status: 200, body: "Healthy landing" });
  }
});
