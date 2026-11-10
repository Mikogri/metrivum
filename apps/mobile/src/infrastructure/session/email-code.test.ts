import { describe, expect, it, vi } from "vitest";
import { createEmailCodeFlow } from "./email-code";

function setup() {
  let now = 1_000;
  const auth = {
    signInWithOtp: vi.fn().mockResolvedValue({ error: null }),
    signUp: vi.fn().mockResolvedValue({
      data: { session: null, user: { identities: [{}] } },
      error: null,
    }),
    resend: vi.fn().mockResolvedValue({ error: null }),
    resetPasswordForEmail: vi.fn().mockResolvedValue({ error: null }),
    verifyOtp: vi.fn().mockResolvedValue({
      data: { session: { user: { id: "one", email: "one@example.com" } } },
      error: null,
    }),
    signOut: vi.fn().mockResolvedValue({ error: null }),
  };
  const complete = vi.fn();
  const flow = createEmailCodeFlow({
    auth: () => auth,
    occupying: () => undefined,
    complete,
    changed: vi.fn(),
    now: () => now,
  });
  return {
    flow,
    auth,
    complete,
    advance: () => {
      now += 60_000;
    },
  };
}
describe("mobile email-code account boundary", () => {
  it("requests sign-in without creating accounts and verifies the email code", async () => {
    const { flow, auth, complete } = setup();
    await flow.request(1, " ONE@example.com ", "email");
    expect(auth.signInWithOtp).toHaveBeenCalledWith({
      email: "one@example.com",
      options: { shouldCreateUser: false },
    });
    await flow.verify("123 456");
    expect(auth.verifyOtp).toHaveBeenCalledWith({
      email: "one@example.com",
      token: "123456",
      type: "email",
    });
    expect(complete).toHaveBeenCalledWith(
      1,
      expect.anything(),
      expect.objectContaining({ type: "email" }),
    );
    await expect(flow.verify("123456")).rejects.toMatchObject({
      code: "invalidCode",
    });
  });
  it("keeps unknown passwordless accounts indistinguishable from sent codes", async () => {
    const { flow, auth } = setup();
    auth.signInWithOtp.mockResolvedValue({ error: { code: "otp_disabled" } });
    await expect(
      flow.request(0, "one@example.com", "email"),
    ).resolves.toBeUndefined();
    expect(flow.pending()?.type).toBe("email");
  });
  it("requires registration consent and carries the selected role to onboarding", async () => {
    const { flow, auth, complete } = setup();
    await expect(
      flow.request(0, "one@example.com", "signup", {
        password: "Correct!Pass93",
        role: "Coach",
        accepted: false,
      }),
    ).rejects.toMatchObject({ code: "termsRequired" });
    expect(auth.signUp).not.toHaveBeenCalled();
    await flow.request(0, "one@example.com", "signup", {
      password: "Correct!Pass93",
      role: "Coach",
      accepted: true,
    });
    expect(auth.signUp.mock.calls[0]![0].options.data).toMatchObject({
      terms_version: "v1",
      registration_role: "Coach",
    });
    await flow.verify("123456");
    expect(complete).toHaveBeenCalledWith(
      0,
      expect.anything(),
      expect.objectContaining({ role: "Coach" }),
    );
  });
  it("enforces resend cooldown and uses the correct recovery verification type", async () => {
    const { flow, auth, advance } = setup();
    await flow.request(0, "one@example.com", "recovery");
    await expect(flow.resend()).rejects.toMatchObject({ code: "rateLimited" });
    advance();
    await flow.resend();
    expect(auth.resetPasswordForEmail).toHaveBeenCalledTimes(2);
    await flow.verify("123456");
    expect(auth.verifyOtp).toHaveBeenCalledWith(
      expect.objectContaining({ type: "recovery" }),
    );
  });
  it("rejects a different identity before completion and removes the unexpected session", async () => {
    const { flow, auth, complete } = setup();
    await flow.request(0, "two@example.com", "email");
    await expect(flow.verify("123456")).rejects.toMatchObject({
      code: "identityChanged",
    });
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(complete).not.toHaveBeenCalled();
  });
  it("cannot complete a code after cancellation while verification is in flight", async () => {
    const { flow, auth, complete } = setup();
    let resolve!: (value: unknown) => void;
    auth.verifyOtp.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    await flow.request(0, "one@example.com", "email");
    const work = flow.verify("123456");
    flow.cancel();
    resolve({
      data: { session: { user: { id: "one", email: "one@example.com" } } },
      error: null,
    });
    await expect(work).rejects.toMatchObject({ code: "invalidCode" });
    expect(complete).not.toHaveBeenCalled();
    expect(auth.signOut).toHaveBeenCalled();
  });
  it("rejects parallel operations and allows retrying a mistyped code", async () => {
    const { flow, auth, complete } = setup();
    let resolve!: (value: unknown) => void;
    auth.signInWithOtp.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const work = flow.request(0, "one@example.com", "email");
    await expect(
      flow.request(1, "two@example.com", "email"),
    ).rejects.toMatchObject({ code: "operationBusy" });
    resolve({ error: null });
    await work;
    auth.verifyOtp.mockResolvedValueOnce({
      data: { session: null },
      error: { code: "otp_expired" },
    });
    await expect(flow.verify("123456")).rejects.toMatchObject({
      code: "otp_expired",
    });
    expect(flow.pending()).not.toBeNull();
    await flow.verify("654321");
    expect(complete).toHaveBeenCalledTimes(1);
  });
  it("never hides mail-provider failures as success", async () => {
    const { flow, auth } = setup();
    auth.signInWithOtp.mockResolvedValueOnce({
      error: { code: "unexpected_failure" },
    });
    await expect(
      flow.request(0, "one@example.com", "email"),
    ).rejects.toMatchObject({ code: "unexpected_failure" });
    expect(flow.pending()).toBeNull();
  });
  it("uses signup resend and detects existing-account signup responses", async () => {
    const { flow, auth, advance } = setup();
    const registration = {
      role: "Client" as const,
      accepted: true,
      password: "Correct!Pass93",
    };
    auth.signUp.mockResolvedValueOnce({
      data: { session: null, user: { identities: [] } },
      error: null,
    });
    await expect(
      flow.request(0, "one@example.com", "signup", registration),
    ).rejects.toMatchObject({ code: "userExists" });
    await flow.request(0, "one@example.com", "signup", registration);
    advance();
    await flow.resend();
    expect(auth.resend).toHaveBeenCalledWith({
      email: "one@example.com",
      type: "signup",
    });
  });
  it("protects occupied slots and retained-account recovery by Auth subject", async () => {
    const { auth } = setup();
    const complete = vi.fn();
    const flow = createEmailCodeFlow({
      auth: () => auth,
      occupying: () => ({ id: "original", email: "one@example.com" }),
      changed: vi.fn(),
      complete,
    });
    await expect(
      flow.request(0, "one@example.com", "email"),
    ).rejects.toMatchObject({ code: "slotUnavailable" });
    await flow.request(0, "one@example.com", "recovery");
    await expect(flow.verify("123456")).rejects.toMatchObject({
      code: "identityChanged",
    });
    expect(complete).not.toHaveBeenCalled();
  });
  it("continues directly when email confirmation is disabled, without trusting a different returned email", async () => {
    const { flow, auth, complete } = setup();
    const registration = {
      role: "Coach" as const,
      accepted: true,
      password: "Correct!Pass93",
    };
    auth.signUp.mockResolvedValueOnce({
      data: {
        session: { user: { id: "one", email: "one@example.com" } },
        user: { identities: [{}] },
      },
      error: null,
    });
    await flow.request(0, "one@example.com", "signup", registration);
    expect(flow.pending()).toBeNull();
    expect(complete).toHaveBeenCalledTimes(1);
    auth.signUp.mockResolvedValueOnce({
      data: {
        session: { user: { id: "two", email: "two@example.com" } },
        user: { identities: [{}] },
      },
      error: null,
    });
    await expect(
      flow.request(1, "one@example.com", "signup", registration),
    ).rejects.toMatchObject({ code: "identityChanged" });
    expect(complete).toHaveBeenCalledTimes(1);
  });
});
