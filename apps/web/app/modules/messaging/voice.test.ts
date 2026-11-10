import { describe, expect, it } from "vitest";
import { wavFile } from "./voice";
describe("voice encoding", () => {
  it("writes mono PCM WAV bytes and clips samples", async () => {
    const file = wavFile({
      length: 2,
      numberOfChannels: 1,
      sampleRate: 8000,
      getChannelData: () => new Float32Array([-2, 2]),
    } as unknown as AudioBuffer);
    expect(file.type).toBe("audio/wav");
    expect(file.size).toBe(48);
    const bytes = await new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
    const view = new DataView(bytes);
    expect(view.getUint16(20, true)).toBe(1);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(8000);
    expect(view.getInt16(44, true)).toBe(-32768);
    expect(view.getInt16(46, true)).toBe(32767);
  });
});
