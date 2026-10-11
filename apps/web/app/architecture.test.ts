import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const appRoot = join(import.meta.dirname);
const uiRoot = join(import.meta.dirname, "../../../packages/ui-web/src");
const mobileUiRoot = join(import.meta.dirname, "../../../packages/ui-mobile/src");

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return files(full);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : [];
  });
}

function importsIn(source: string): string[] {
  const imports: string[] = [];
  const visit = (node: ts.Node) => {
    const spec = (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) ? node.moduleSpecifier
      : ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || ts.isIdentifier(node.expression) && node.expression.text === "require") ? node.arguments[0]
        : ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) ? node.argument.literal : undefined;
    if (spec && ts.isStringLiteralLike(spec)) imports.push(spec.text);
    ts.forEachChild(node, visit);
  };
  visit(ts.createSourceFile("source.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX));
  return imports;
}
const importsOf = (file: string) => importsIn(readFileSync(file, "utf8"));

describe("module boundaries", () => {
  it("recognizes static, side-effect, re-export, type and dynamic import syntax without matching comments", () => {
    expect(importsIn(`import 'one'; export * from "two"; const three = import('three');
      type Four = import('four').Value; const five = require('five'); // from "ignored"
      /* import('also-ignored') */`)).toEqual(["one", "two", "three", "four", "five"]);
  });
  it("modules import other modules only through their public index", () => {
    const violations: string[] = [];
    for (const file of files(join(appRoot, "modules"))) {
      const own = relative(join(appRoot, "modules"), file).split(sep)[0];
      for (const spec of importsOf(file)) {
        const target = spec.startsWith(".") ? relative(appRoot, resolve(dirname(file), spec)).split(sep).join("/") : spec.replace(/^~\//, "");
        const match = /^modules\/([^/]+)(\/.*)?$/.exec(target);
        if (match && match[1] !== own && match[2]) violations.push(`${relative(appRoot, file)} -> ${spec}`);
      }
    }
    expect(violations).toEqual([]);
  });

  it("shared code does not depend on feature modules", () => {
    const violations = files(join(appRoot, "shared")).flatMap((file) => importsOf(file).filter((s) => s.startsWith("~/modules/")).map((s) => `${relative(appRoot, file)} -> ${s}`));
    expect(violations).toEqual([]);
  });

  it.each([uiRoot, mobileUiRoot])("UI package %s has no app, transport or access dependencies", (root) => {
    const forbidden = /^(~\/|@\/|@supabase\/|@tanstack\/react-query|@microsoft\/signalr|@trainflow\/api-client|axios|jose|jwt-decode)/;
    const violations = files(root).flatMap((file) => importsOf(file).filter((s) => forbidden.test(s)
      || s.startsWith(".") && relative(root, resolve(dirname(file), s)).startsWith(".."))
      .map((s) => `${relative(root, file)} -> ${s}`));
    expect(violations).toEqual([]);
  });

  it("portable API contracts and transport do not depend on a UI or native runtime", () => {
    const root = join(appRoot, "../../../packages/api-client-web/src");
    const forbidden = /^(react($|\/|-)|react-dom|expo($|\/|-)|@expo\/|@trainflow\/ui-|pg$|postgres|@supabase\/)/;
    expect(files(root).flatMap((file) => importsOf(file).filter((s) => forbidden.test(s))
      .map((s) => `${relative(root, file)} -> ${s}`))).toEqual([]);
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
