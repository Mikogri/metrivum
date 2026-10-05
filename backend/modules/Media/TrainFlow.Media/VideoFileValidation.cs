using System.Text;
using TrainFlow.BuildingBlocks;

namespace TrainFlow.Media;

public static class VideoFileValidation
{
    public static string Extension(string contentType) => contentType switch
    {
        "video/mp4" => "mp4",
        "video/webm" => "webm",
        _ => throw new ApiException(400, "MEDIA_FORMAT_INVALID", "Only MP4 and WebM videos are accepted.")
    };

    public static void Validate(string contentType, long expected, long actual, byte[] prefix, long maxBytes)
    {
        if (actual <= 0 || actual != expected || actual > maxBytes)
            throw new ApiException(400, "MEDIA_SIZE_INVALID", "Stored object size does not match the upload reservation.");
        var valid = contentType switch
        {
            "video/mp4" => prefix.Length >= 16 && prefix.AsSpan(4, 4).SequenceEqual("ftyp"u8) &&
                new[] { "isom", "iso2", "mp41", "mp42", "avc1", "M4V ", "dash" }.Contains(Encoding.ASCII.GetString(prefix, 8, 4)),
            "video/webm" => prefix.Length >= 16 && prefix.AsSpan(0, 4).SequenceEqual(new byte[] { 0x1a, 0x45, 0xdf, 0xa3 }) &&
                prefix.AsSpan().IndexOf("webm"u8) >= 0,
            _ => false
        };
        if (!valid)
            throw new ApiException(400, "MEDIA_FORMAT_INVALID", "Stored bytes do not identify the declared video container.");
    }
}
