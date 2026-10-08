import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

const appRoot = join(import.meta.dirname);
const uiRoot = join(import.meta.dirname, "../../../packages/ui-web/src");

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return files(full);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : [];
  });
}

const importsOf = (file: string) => [...readFileSync(file, "utf8").matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]!);

describe("module boundaries", () => {
  it("modules import other modules only through their public index", () => {
    const violations: string[] = [];
    for (const file of files(join(appRoot, "modules"))) {
      const own = relative(join(appRoot, "modules"), file).split(sep)[0];
      for (const spec of importsOf(file)) {
        const match = /^~\/modules\/([^/]+)(\/.*)?$/.exec(spec);
        if (match && match[1] !== own && match[2]) violations.push(`${relative(appRoot, file)} -> ${spec}`);
      }
    }
    expect(violations).toEqual([]);
  });

  it("shared code does not depend on feature modules", () => {
    const violations = files(join(appRoot, "shared")).flatMap((file) => importsOf(file).filter((s) => s.startsWith("~/modules/")).map((s) => `${relative(appRoot, file)} -> ${s}`));
    expect(violations).toEqual([]);
  });

  it("ui-web knows nothing about the app, API, Supabase or access control", () => {
    const forbidden = /^(~\/|@supabase\/|@tanstack\/react-query|@trainflow\/api-client-web)/;
    const violations = files(uiRoot).flatMap((file) => importsOf(file).filter((s) => forbidden.test(s)).map((s) => `${relative(uiRoot, file)} -> ${s}`));
    expect(violations).toEqual([]);
  });

  it("business data never goes through supabase.from()", () => {
    const offenders = files(appRoot).filter((file) => /\.from\(\s*["'`]/.test(readFileSync(file, "utf8")) && readFileSync(file, "utf8").includes("supabase"));
    expect(offenders).toEqual([]);
  });

  it("no secret-looking keys in VITE_ variables", () => {
    const variables = readFileSync(join(appRoot, "../.env.example"), "utf8")
      .split(/\r?\n/)
      .filter((line) => line.trim() && !line.trim().startsWith("#"));
    expect(variables.every((line) => line.startsWith("VITE_"))).toBe(true);
    expect(variables.join(" ")).not.toMatch(/service_role|secret|password|postgres/i);
  });
});
