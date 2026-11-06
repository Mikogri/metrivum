import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTurnstile, type TurnstileApi } from "./Turnstile";
import { AppLocaleProvider } from "~/shared/i18n/AppLocale";
import { turnstileConfig } from "../lib/turnstile-config";

let options: Parameters<TurnstileApi["render"]>[1];
const reset = vi.fn();
const remove = vi.fn();
const submitted = vi.fn();
function Form({ scope = "slot:0:signup" }) {
  const captcha = useTurnstile(scope);
  return <form onSubmit={event => { event.preventDefault(); const token = captcha.take(); if (token) submitted(token); }}>
    {captcha.widget}<button disabled={!captcha.ready}>Submit</button>
  </form>;
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("VITE_TURNSTILE_SITE_KEY", "public-test-site-key");
  vi.stubEnv("VITE_AUTH_CAPTCHA_REQUIRED", "true");
  window.turnstile = { render: vi.fn((_element, value) => { options = value; return "widget-1"; }), reset, remove };
});
afterEach(() => { delete window.turnstile; vi.unstubAllEnvs(); vi.useRealTimers(); });
describe("Turnstile form boundary", () => {
  it("uses Managed interaction-only dark rendering and refuses missing/reused tokens even on direct submit", async () => {
    const { container } = render(<Form />);
    await waitFor(() => expect(window.turnstile?.render).toHaveBeenCalled());
    expect(options).toMatchObject({ appearance: "interaction-only", theme: "dark", "response-field": false });
    fireEvent.submit(container.querySelector("form")!);
    expect(submitted).not.toHaveBeenCalled();
    act(() => options.callback("one-use-token"));
    fireEvent.submit(container.querySelector("form")!);
    fireEvent.submit(container.querySelector("form")!);
    expect(submitted).toHaveBeenCalledExactlyOnceWith({ captchaToken: "one-use-token" });
    expect(reset).toHaveBeenCalledOnce();
  });
  it("invalidates expiration/errors and lets the person request a new challenge", async () => {
    render(<Form />);
    await waitFor(() => expect(window.turnstile?.render).toHaveBeenCalled());
    act(() => options.callback("expires"));
    act(() => options["expired-callback"]());
    expect(screen.getByRole("button", { name: "Submit" })).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent("expired");
    fireEvent.click(screen.getByRole("button", { name: "Retry verification" }));
    await waitFor(() => expect(window.turnstile?.render).toHaveBeenCalledTimes(2));
    act(() => options["error-callback"]());
    expect(screen.getByRole("alert")).toHaveTextContent("failed");
  });
  it("drops a token and stale callbacks when the account/form context changes", async () => {
    const { rerender, container } = render(<Form />);
    await waitFor(() => expect(window.turnstile?.render).toHaveBeenCalled());
    const previous = options;
    act(() => previous.callback("old-account-token"));
    rerender(<Form scope="slot:1:signup" />);
    await waitFor(() => expect(window.turnstile?.render).toHaveBeenCalledTimes(2));
    act(() => previous.callback("late-old-account-token"));
    fireEvent.submit(container.querySelector("form")!);
    expect(submitted).not.toHaveBeenCalled();
    expect(remove).toHaveBeenCalledWith("widget-1");
  });
  it("fails closed for required missing configuration", () => {
    vi.stubEnv("VITE_TURNSTILE_SITE_KEY", "");
    const { container } = render(<Form />);
    expect(screen.getByRole("alert")).toHaveTextContent("unavailable");
    fireEvent.submit(container.querySelector("form")!);
    expect(submitted).not.toHaveBeenCalled();
  });
  it("uses Polish widget and error copy for the selected locale", async () => {
    localStorage.setItem("tf.locale", "pl");
    try {
      render(<AppLocaleProvider><Form /></AppLocaleProvider>);
      await waitFor(() => expect(options.language).toBe("pl"));
      act(() => options["error-callback"]());
      expect(screen.getByRole("alert")).toHaveTextContent("Weryfikacja");
      expect(screen.getByRole("button", { name: "Ponów weryfikację" })).toBeInTheDocument();
    } finally { localStorage.removeItem("tf.locale"); }
  });
  it("requires production CAPTCHA and rejects public dummy keys", () => {
    vi.stubEnv("PROD", true);
    vi.stubEnv("VITE_AUTH_CAPTCHA_REQUIRED", "");
    vi.stubEnv("VITE_TURNSTILE_SITE_KEY", "");
    expect(turnstileConfig()).toMatchObject({ required: true, valid: false });
    vi.stubEnv("VITE_TURNSTILE_SITE_KEY", "1x00000000000000000000AA");
    expect(turnstileConfig()).toMatchObject({ required: true, valid: false });
  });
});
