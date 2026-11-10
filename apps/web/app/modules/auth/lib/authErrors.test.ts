import { AuthApiError, AuthRetryableFetchError } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { appEn } from "~/shared/i18n/messages/app.en";
import {
  authErrorText,
  isEmailDeliveryFailure,
  passwordProblem,
} from "./authErrors";

describe("authErrorText", () => {
  it("does not describe an SMTP/server failure as an internet problem", () => {
    const text = authErrorText(
      appEn,
      new AuthRetryableFetchError("private SMTP diagnostic", 500),
    );
    expect(text).not.toBe(appEn.auth.errors.network);
    expect(text).not.toContain("private SMTP diagnostic");
  });
  it("preserves the connection message when no HTTP response arrived", () => {
    expect(
      authErrorText(appEn, new AuthRetryableFetchError("Failed to fetch", 0)),
    ).toBe(appEn.auth.errors.network);
  });
});

describe("sign-up email delivery failures", () => {
  it("names a failed confirmation email instead of a generic service error", () => {
    const smtp = new AuthRetryableFetchError(
      "Error sending confirmation email",
      500,
    );
    expect(isEmailDeliveryFailure(smtp)).toBe(true);
    expect(authErrorText(appEn, smtp)).toBe(appEn.auth.errors.emailDelivery);
  });

  it("keeps other server errors and rate limits as they were", () => {
    expect(
      authErrorText(
        appEn,
        new AuthRetryableFetchError("Database error saving new user", 500),
      ),
    ).toBe(appEn.auth.errors.serviceUnavailable);
    expect(
      authErrorText(
        appEn,
        new AuthApiError(
          "Email rate limit exceeded",
          429,
          "over_email_send_rate_limit",
        ),
      ),
    ).toBe(appEn.auth.errors.rateLimited);
    expect(
      isEmailDeliveryFailure(
        new AuthApiError(
          "Error sending confirmation email",
          400,
          "validation_failed",
        ),
      ),
    ).toBe(false);
  });
});

describe("passwordProblem", () => {
  it("refuses common passwords, repeated characters and the email name", () => {
    expect(passwordProblem(appEn, "Password123")).toBe(
      appEn.auth.errors.passwordWeak,
    );
    expect(passwordProblem(appEn, "abababab")).toBe(
      appEn.auth.errors.passwordWeak,
    );
    expect(
      passwordProblem(appEn, "anna.kowalska!2", "Anna.Kowalska@example.test"),
    ).toBe(appEn.auth.errors.passwordWeak);
    expect(passwordProblem(appEn, "short")).toBe(
      appEn.auth.errors.passwordShort,
    );
    expect(
      passwordProblem(appEn, "plum-ridge-forty", "anna@example.test"),
    ).toBeNull();
  });
});
