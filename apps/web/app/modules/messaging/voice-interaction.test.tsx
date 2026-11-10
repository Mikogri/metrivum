import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { VoicePlayer, VoicePreview, VoiceRecorder } from "./voice";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it("uses filled playback icons for sent voice messages", () => {
  const { container } = render(
    <VoicePlayer src="blob:sent" label="Voice message" seed="sent" />,
  );
  expect(
    screen.getByRole("button", { name: "Play" }).querySelector("svg"),
  ).toHaveAttribute("fill", "currentColor");
  fireEvent.play(container.querySelector("audio")!);
  expect(
    screen.getByRole("button", { name: "Pause" }).querySelector("svg"),
  ).toHaveAttribute("fill", "currentColor");
});
it("shows elapsed recording and cancels without creating an attachment", async () => {
  vi.useFakeTimers();
  const stop = vi.fn();
  vi.stubGlobal("navigator", {
    mediaDevices: {
      getUserMedia: async () => ({ getTracks: () => [{ stop }] }),
    },
  });
  vi.stubGlobal(
    "MediaRecorder",
    class {
      state = "inactive";
      stream: MediaStream;
      onstop = () => {};
      constructor(stream: MediaStream) {
        this.stream = stream;
      }
      start() {
        this.state = "recording";
      }
      stop() {
        this.state = "inactive";
        this.onstop();
      }
    },
  );
  vi.stubGlobal(
    "AudioContext",
    class {
      createMediaStreamSource() {
        return { connect() {} };
      }
      createAnalyser() {
        return {
          fftSize: 256,
          getByteTimeDomainData(data: Uint8Array) {
            data.fill(128);
          },
        };
      }
      close() {
        return Promise.resolve();
      }
    },
  );
  const onFile = vi.fn();
  const onBusyChange = vi.fn();
  render(
    <VoiceRecorder
      disabled={false}
      onFile={onFile}
      onBusyChange={onBusyChange}
    />,
  );
  await act(async () => {
    fireEvent.click(
      screen.getByRole("button", { name: "Record voice message" }),
    );
  });
  expect(screen.getByRole("button", { name: "Stop recording" })).toBeEnabled();
  await act(async () => {
    vi.advanceTimersByTime(2000);
  });
  expect(screen.getByText("0:02")).toBeInTheDocument();
  expect(screen.getByLabelText("Live audio waveform")).toBeInTheDocument();
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Cancel recording" }));
  });
  expect(onFile).not.toHaveBeenCalled();
  expect(stop).toHaveBeenCalled();
  expect(onBusyChange).toHaveBeenLastCalledWith(false);
});

it("releases the microphone when permission resolves after cancellation", async () => {
  let resolve!: (stream: MediaStream) => void;
  const stop = vi.fn();
  vi.stubGlobal("navigator", {
    mediaDevices: {
      getUserMedia: () =>
        new Promise<MediaStream>((done) => {
          resolve = done;
        }),
    },
  });
  vi.stubGlobal("MediaRecorder", class {});
  const onFile = vi.fn();
  render(
    <VoiceRecorder disabled={false} onFile={onFile} onBusyChange={() => {}} />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Record voice message" }));
  fireEvent.click(screen.getByRole("button", { name: "Cancel recording" }));
  await act(async () => {
    resolve({ getTracks: () => [{ stop }] } as unknown as MediaStream);
  });
  expect(stop).toHaveBeenCalledOnce();
  expect(onFile).not.toHaveBeenCalled();
  expect(
    screen.getByRole("button", { name: "Record voice message" }),
  ).toBeEnabled();
});
it("previews a ready recording inline and releases its object URL", () => {
  const revoke = vi.fn();
  vi.stubGlobal("URL", {
    createObjectURL: () => "blob:preview",
    revokeObjectURL: revoke,
  });
  const cancel = vi.fn();
  const { container, unmount } = render(
    <VoicePreview
      file={new File(["wav"], "voice.wav", { type: "audio/wav" })}
      disabled={false}
      cancel={cancel}
    />,
  );
  expect(
    screen.getByRole("group", { name: "Preview voice message" }),
  ).toBeInTheDocument();
  expect(container.querySelector("audio")).toHaveAttribute(
    "src",
    "blob:preview",
  );
  fireEvent.click(screen.getByRole("button", { name: "Delete recording" }));
  expect(cancel).toHaveBeenCalledOnce();
  unmount();
  expect(revoke).toHaveBeenCalledWith("blob:preview");
});

it("uses the same ghost control for starting a recording and playing its draft", () => {
  vi.stubGlobal("URL", {
    createObjectURL: () => "blob:preview",
    revokeObjectURL: vi.fn(),
  });
  render(
    <>
      <VoiceRecorder
        disabled={false}
        onFile={() => {}}
        onBusyChange={() => {}}
      />
      <VoicePreview
        file={new File(["wav"], "voice.wav", { type: "audio/wav" })}
        disabled={false}
        cancel={() => {}}
      />
    </>,
  );
  const record = screen.getByRole("button", { name: "Record voice message" });
  const play = screen.getByRole("button", { name: "Play" });
  expect(play.className).toBe(record.className);
  expect(play.getAttribute("data-size")).toBe(record.getAttribute("data-size"));
});
