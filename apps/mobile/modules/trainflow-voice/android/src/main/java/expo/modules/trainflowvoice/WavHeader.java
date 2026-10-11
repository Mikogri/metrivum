package expo.modules.trainflowvoice;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;

public final class WavHeader {
  public static final int SAMPLE_RATE = 16000;
  public static final int MAX_DATA_BYTES = SAMPLE_RATE * 2 * 300;

  private WavHeader() { }

  public static byte[] create(int dataBytes) {
    if (dataBytes < 0 || dataBytes > MAX_DATA_BYTES || dataBytes % 2 != 0)
      throw new IllegalArgumentException("Invalid PCM16 data length");
    ByteBuffer buffer = ByteBuffer.allocate(44).order(ByteOrder.LITTLE_ENDIAN);
    buffer.put("RIFF".getBytes(StandardCharsets.US_ASCII)).putInt(36 + dataBytes);
    buffer.put("WAVEfmt ".getBytes(StandardCharsets.US_ASCII)).putInt(16);
    buffer.putShort((short) 1).putShort((short) 1).putInt(SAMPLE_RATE).putInt(SAMPLE_RATE * 2);
    buffer.putShort((short) 2).putShort((short) 16);
    buffer.put("data".getBytes(StandardCharsets.US_ASCII)).putInt(dataBytes);
    return buffer.array();
  }
}
