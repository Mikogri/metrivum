import { describe, expect, it } from "vitest";
import { isValidEmail, normalizeEmail } from "./email";

describe("isValidEmail", () => {
  it.each([
    "anna@example.com",
    "Anna.Kowalska@Example.COM",
    "anna+training@example.co.uk",
    "o'neil@example.ie",
    "coach_1@sub.domain-name.pl",
    "łukasz@przykład.pl",
    "  anna@example.com  ",
    `${"a".repeat(64)}@example.com`,
  ])("accepts %s", (email) => expect(isValidEmail(email)).toBe(true));

  it.each([
    "",
    "anna",
    "anna@",
    "@example.com",
    "anna@example",
    "anna@@example.com",
    "an@na@example.com",
    "anna example@example.com",
    "anna@exa mple.com",
    "anna@example..com",
    "anna@-example.com",
    "anna@example-.com",
    ".anna@example.com",
    "anna.@example.com",
    "an..na@example.com",
    "anna@example.123",
    "anna\u0000@example.com",
    "anna​@example.com",
    "anna‮@example.com",
    "<anna>@example.com",
    `${"a".repeat(65)}@example.com`,
    `anna@${"a".repeat(250)}.com`,
  ])("rejects %j", (email) => expect(isValidEmail(email)).toBe(false));
});

describe("normalizeEmail", () => {
  it("trims but keeps case for the server to decide", () =>
    expect(normalizeEmail("  Anna@Example.com ")).toBe("Anna@Example.com"));
});
