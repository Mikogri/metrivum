import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useNotificationSound } from "./notification-sound";

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});
it("waits for a gesture, plays a short tone, throttles bursts and respects mute", () => {
  const start = vi.fn();
  const close = vi.fn(async () => {});
  const param = {
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
  };
  const gain = { gain: param, connect: vi.fn(), disconnect: vi.fn() };
  vi.stubGlobal(
    "AudioContext",
    class {
      state = "running";
      currentTime = 0;
      destination = {};
      resume = async () => {};
      close = close;
      createGain = () => gain;
      createOscillator = () => ({
        frequency: param,
        connect: () => gain,
        start,
        stop: vi.fn(),
        disconnect: vi.fn(),
      });
    },
  );
  const { result, unmount } = renderHook(() => useNotificationSound("account"));
  act(() => result.current.play());
  expect(start).not.toHaveBeenCalled();
  act(() => window.dispatchEvent(new Event("pointerdown")));
  act(() => {
    result.current.play();
    result.current.play();
  });
  expect(start).toHaveBeenCalledOnce();
  act(() => result.current.toggle());
  expect(localStorage.getItem("tf.notification-sound.account")).toBe("muted");
  act(() => result.current.play());
  expect(start).toHaveBeenCalledOnce();
  unmount();
  expect(close).toHaveBeenCalledOnce();
});
