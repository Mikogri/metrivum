import { createClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

describe("installed Supabase SDK CAPTCHA transport", () => {
  it.each(["signup", "password", "otp", "reset", "resend"])("serializes %s CAPTCHA for server verification", async operation => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ user: null, session: null }), { status: 200, headers: { "Content-Type": "application/json" } }));
    const client = createClient("http://127.0.0.1:54321", "public-key", {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: `captcha-${operation}` },
      global: { fetch },
    });
    const options = { captchaToken: "test-one-use-token" };
    switch (operation) {
      case "signup": await client.auth.signUp({ email: "local@example.test", password: "test-password", options }); break;
      case "password": await client.auth.signInWithPassword({ email: "local@example.test", password: "test-password", options }); break;
      case "otp": await client.auth.signInWithOtp({ email: "local@example.test", options: { ...options, shouldCreateUser: false } }); break;
      case "reset": await client.auth.resetPasswordForEmail("local@example.test", options); break;
      case "resend": await client.auth.resend({ type: "signup", email: "local@example.test", options }); break;
    }
    expect(fetch).toHaveBeenCalledOnce();
    const call = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(call[1].body))).toMatchObject({ gotrue_meta_security: { captcha_token: "test-one-use-token" } });
  });
});
