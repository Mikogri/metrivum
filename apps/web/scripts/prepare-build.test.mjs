import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { assetOrigin } from "./asset-origin.mjs";

test("external assets require an exact HTTPS origin", () => {
  assert.equal(assetOrigin(""), null);
  assert.equal(
    assetOrigin("https://assets.metrivum.com/"),
    "https://assets.metrivum.com",
  );
  for (const value of [
    "http://assets.example.com",
    "https://user:password@assets.example.com",
    "https://assets.example.com/models",
    "https://assets.example.com/?key=value",
    "https://assets.example.com/#x",
    "invalid",
  ]) {
    assert.throws(() => assetOrigin(value));
  }
});

test("external-asset build succeeds without Python or network access", () => {
  const result = spawnSync(
    process.execPath,
    [fileURLToPath(new URL("./prepare-build.mjs", import.meta.url))],
    {
      env: {
        ...process.env,
        PATH: "",
        Path: "",
        PAGES_ASSET_ORIGIN: "https://assets.example.invalid",
      },
      encoding: "utf8",
    },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Using published anatomy assets/);
});

test("invalid external asset origin fails the prebuild", () => {
  const result = spawnSync(
    process.execPath,
    [fileURLToPath(new URL("./prepare-build.mjs", import.meta.url))],
    {
      env: { ...process.env, PAGES_ASSET_ORIGIN: "http://assets.example.com" },
      encoding: "utf8",
    },
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /HTTPS origin/);
});
