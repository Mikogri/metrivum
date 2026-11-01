package expo.modules.trainflowvoice;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;

/** Executable with a JDK alone; no Android device or test framework required. */
public final class WavHeaderTest {
  public static void main(String[] args) {
    byte[] header = WavHeader.create(32000);
    ByteBuffer bytes = ByteBuffer.wrap(header).order(ByteOrder.LITTLE_ENDIAN);
    check(header.length == 44, "fixed RIFF header size");
    check(new String(header, 0, 4, StandardCharsets.US_ASCII).equals("RIFF"), "RIFF signature");
    check(new String(header, 8, 4, StandardCharsets.US_ASCII).equals("WAVE"), "WAVE signature");
    check(bytes.getInt(4) == 32036 && bytes.getInt(40) == 32000, "container and data sizes");
    check(bytes.getShort(20) == 1 && bytes.getShort(22) == 1, "PCM mono");
    check(bytes.getInt(24) == 16000 && bytes.getInt(28) == 32000, "rate and byte rate");
    check(bytes.getShort(32) == 2 && bytes.getShort(34) == 16, "PCM16 alignment");
    check(WavHeader.create(9600000).length == 44, "five-minute boundary");
    for (int invalid : new int[] {-2, 1, 9600002}) {
      try { WavHeader.create(invalid); throw new AssertionError("invalid size accepted"); }
      catch (IllegalArgumentException expected) { }
    }
    System.out.println("WAV header checks passed");
  }
  private static void check(boolean condition, String message) {
    if (!condition) throw new AssertionError(message);
  }
}
