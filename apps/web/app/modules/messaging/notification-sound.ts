import { useCallback, useEffect, useRef, useState } from "react";

export function useNotificationSound(accountKey: string) {
  const key = `tf.notification-sound.${accountKey}`;
  const [muted, setMuted] = useState(() => {
    try {
      return localStorage.getItem(key) === "muted";
    } catch {
      return false;
    }
  });
  const context = useRef<AudioContext | null>(null);
  const lastPlayed = useRef(0);
  useEffect(() => {
    // Browsers require a user gesture before audio can play.
    const unlock = () => {
      if (typeof AudioContext === "undefined") return;
      try {
        context.current ??= new AudioContext();
        void context.current.resume().catch(() => {});
      } catch {
        /* Audio is optional. */
      }
    };
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      void context.current?.close().catch(() => {});
      context.current = null;
    };
  }, []);
  const play = useCallback(() => {
    const audio = context.current;
    if (
      muted ||
      !audio ||
      audio.state !== "running" ||
      Date.now() - lastPlayed.current < 1000
    )
      return;
    lastPlayed.current = Date.now();
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(740, audio.currentTime);
    oscillator.frequency.setValueAtTime(990, audio.currentTime + 0.08);
    gain.gain.setValueAtTime(0, audio.currentTime);
    gain.gain.linearRampToValueAtTime(0.08, audio.currentTime + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.2);
    oscillator.connect(gain).connect(audio.destination);
    oscillator.start();
    oscillator.stop(audio.currentTime + 0.21);
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
    };
  }, [muted]);
  return {
    muted,
    play,
    toggle: () =>
      setMuted((value) => {
        try {
          localStorage.setItem(key, value ? "on" : "muted");
        } catch {
          /* Keep the session preference. */
        }
        return !value;
      }),
  };
}
