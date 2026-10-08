import { AuthRetryableFetchError } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { appEn } from "~/shared/i18n/messages/app.en";
import { authErrorText } from "./authErrors";

describe("authErrorText", () => {
  it("does not describe an SMTP/server failure as an internet problem", () => {
    const text = authErrorText(appEn, new AuthRetryableFetchError("private SMTP diagnostic", 500));
    expect(text).not.toBe(appEn.auth.errors.network);
    expect(text).not.toContain("private SMTP diagnostic");
  });
  it("preserves the connection message when no HTTP response arrived", () => {
    expect(authErrorText(appEn, new AuthRetryableFetchError("Failed to fetch", 0))).toBe(appEn.auth.errors.network);
  });
});
