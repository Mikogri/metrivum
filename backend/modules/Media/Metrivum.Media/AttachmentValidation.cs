using System.Buffers.Binary;
using System.Text;
using Metrivum.BuildingBlocks;

namespace Metrivum.Media;

/// <summary>Validates attachment names, formats and size limits before media acceptance.</summary>
public static class AttachmentValidation
{
    public static string Extension(string mime) => mime switch
    {
        "image/png" => "png",
        "image/jpeg" => "jpg",
        "image/gif" => "gif",
        "image/webp" => "webp",
        "application/pdf" => "pdf",
        "text/plain" => "txt",
        "application/zip" => "zip",
        "audio/wav" => "wav",
        "video/mp4" => "mp4",
        "video/webm" => "webm",
        _ => throw Invalid()
    };

    public static void Validate(string mime, long expected, StoredObject actual, StorageOptions options)
    {
        if (!options.AllowedAttachmentTypes.Contains(mime, StringComparer.Ordinal) || actual.ContentType != mime)
            throw Invalid();
        if (expected <= 0 || actual.Size != expected || actual.Size > options.MaxAttachmentBytes)
            throw new ApiException(400, "MEDIA_SIZE_INVALID", "Attachment size does not match its reservation or configured limit.");
        var bytes = actual.Prefix.AsSpan();
        var valid = mime switch
        {
            "image/png" => bytes.StartsWith(new byte[] { 137, 80, 78, 71, 13, 10, 26, 10 }),
            "image/jpeg" => bytes.StartsWith(new byte[] { 255, 216, 255 }),
            "image/gif" => bytes.StartsWith("GIF87a"u8) || bytes.StartsWith("GIF89a"u8),
            "image/webp" => bytes.Length >= 12 && bytes[..4].SequenceEqual("RIFF"u8) && bytes[8..12].SequenceEqual("WEBP"u8),
            "application/pdf" => bytes.StartsWith("%PDF-"u8),
            "application/zip" => bytes.StartsWith(new byte[] { 80, 75, 3, 4 }) || bytes.StartsWith(new byte[] { 80, 75, 5, 6 }),
            "text/plain" => IsText(bytes),
            "audio/wav" => bytes.Length >= 12 && bytes[..4].SequenceEqual("RIFF"u8) && bytes[8..12].SequenceEqual("WAVE"u8),
            "video/mp4" or "video/webm" => true,
            _ => false
        };
        if (!valid)
            throw Invalid();
        if (mime.StartsWith("video/", StringComparison.Ordinal))
            VideoFileValidation.Validate(mime, expected, actual.Size, actual.Prefix, options.MaxAttachmentBytes);
    }

    private static bool IsText(ReadOnlySpan<byte> bytes)
    {
        if (bytes.Contains((byte)0))
            return false;
        try
        {
            new UTF8Encoding(false, true).GetDecoder().Convert(bytes, new char[bytes.Length], false, out _, out _, out _);
            return true;
        }
        catch (DecoderFallbackException) { return false; }
    }

    // Read the complete bounded WAV: client-reported durations and RIFF length fields alone are not evidence.
    public static async Task<long> WavDurationAsync(Stream stream, long size, long maximumDurationMs, CancellationToken ct)
    {
        if (size is < 44 or > 67108864)
            throw Invalid();
        var bytes = new byte[(int)size];
        try
        {
            await stream.ReadExactlyAsync(bytes, ct);
        }
        catch (EndOfStreamException) { throw Invalid(); }
        if (await stream.ReadAsync(new byte[1], ct) != 0 || !bytes.AsSpan(0, 4).SequenceEqual("RIFF"u8) ||
            !bytes.AsSpan(8, 4).SequenceEqual("WAVE"u8) || BinaryPrimitives.ReadUInt32LittleEndian(bytes.AsSpan(4)) != size - 8)
            throw Invalid();
        uint rate = 0;
        ushort align = 0;
        long data = 0;
        for (var offset = 12; offset + 8 <= bytes.Length;)
        {
            var length = BinaryPrimitives.ReadUInt32LittleEndian(bytes.AsSpan(offset + 4));
            if (length > bytes.Length - offset - 8)
                throw Invalid();
            if (bytes.AsSpan(offset, 4).SequenceEqual("fmt "u8))
            {
                if (length < 16 || rate != 0 || BinaryPrimitives.ReadUInt16LittleEndian(bytes.AsSpan(offset + 8)) != 1)
                    throw Invalid();
                var channels = BinaryPrimitives.ReadUInt16LittleEndian(bytes.AsSpan(offset + 10));
                var sampleRate = BinaryPrimitives.ReadUInt32LittleEndian(bytes.AsSpan(offset + 12));
                rate = BinaryPrimitives.ReadUInt32LittleEndian(bytes.AsSpan(offset + 16));
                align = BinaryPrimitives.ReadUInt16LittleEndian(bytes.AsSpan(offset + 20));
                var bits = BinaryPrimitives.ReadUInt16LittleEndian(bytes.AsSpan(offset + 22));
                if (channels is < 1 or > 2 || sampleRate is < 8000 or > 192000 || bits is not (8 or 16 or 24 or 32) || align != channels * bits / 8 || rate != sampleRate * align)
                    throw Invalid();
            }
            if (bytes.AsSpan(offset, 4).SequenceEqual("data"u8))
                data += length;
            offset = checked(offset + 8 + (int)length + (int)(length % 2));
        }
        if (rate == 0 || data == 0 || data % align != 0)
            throw Invalid();
        var duration = (data * 1000 + rate - 1) / rate;
        if (duration > maximumDurationMs)
            throw new ApiException(400, "MEDIA_DURATION_INVALID", "Voice message exceeds the configured duration limit.");
        return duration;
    }

    private static ApiException Invalid() => new(400, "MEDIA_FORMAT_INVALID", "The attachment format is unsupported or its bytes do not match its declared type.");
}
