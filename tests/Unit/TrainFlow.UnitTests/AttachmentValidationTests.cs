using System.Text;
using TrainFlow.BuildingBlocks;
using TrainFlow.Media;

namespace TrainFlow.UnitTests;

public class AttachmentValidationTests
{
    [Theory]
    [InlineData("image/png", "89504E470D0A1A0A")]
    [InlineData("image/jpeg", "FFD8FF")]
    [InlineData("image/gif", "474946383961")]
    [InlineData("image/webp", "524946460000000057454250")]
    [InlineData("application/pdf", "255044462D312E37")]
    [InlineData("application/zip", "504B0304")]
    [InlineData("text/plain", "48656C6C6F")]
    public void Signature_and_configured_limits_are_enforced(string mime, string hex)
    {
        var bytes = Convert.FromHexString(hex);
        AttachmentValidation.Validate(mime, bytes.Length, new(bytes.Length, mime, bytes), new());
        Assert.Throws<ApiException>(() => AttachmentValidation.Validate(mime, bytes.Length + 1, new(bytes.Length, mime, bytes), new()));
        Assert.Throws<ApiException>(() => AttachmentValidation.Validate(mime, bytes.Length, new(bytes.Length, mime, bytes), new() { AllowedAttachmentTypes = [] }));
        Assert.Throws<ApiException>(() => AttachmentValidation.Validate(mime, bytes.Length, new(bytes.Length, "text/html", bytes), new()));
    }

    [Fact]
    public void Arbitrary_bytes_cannot_become_image_and_binary_cannot_become_text()
    {
        Assert.Throws<ApiException>(() => AttachmentValidation.Validate("image/png", 5, new(5, "image/png", "hello"u8.ToArray()), new()));
        Assert.Throws<ApiException>(() => AttachmentValidation.Validate("text/plain", 2, new(2, "text/plain", [0, 255]), new()));
    }

    [Fact]
    public async Task Voice_duration_is_derived_from_complete_pcm_and_cannot_be_forged()
    {
        var bytes = Wav();
        Assert.Equal(1000, await AttachmentValidation.WavDurationAsync(new MemoryStream(bytes), bytes.Length, 1000, default));
        Assert.Equal("MEDIA_DURATION_INVALID", (await Assert.ThrowsAsync<ApiException>(() => AttachmentValidation.WavDurationAsync(new MemoryStream(bytes), bytes.Length, 999, default))).Code);
        await Assert.ThrowsAsync<ApiException>(() => AttachmentValidation.WavDurationAsync(new MemoryStream(bytes[..^1]), bytes.Length, 1000, default));
        bytes[28] = 1;
        await Assert.ThrowsAsync<ApiException>(() => AttachmentValidation.WavDurationAsync(new MemoryStream(bytes), bytes.Length, 1000, default));
    }

    private static byte[] Wav()
    {
        using var stream = new MemoryStream();
        using var writer = new BinaryWriter(stream, Encoding.UTF8, true);
        writer.Write("RIFF"u8);
        writer.Write(16036);
        writer.Write("WAVEfmt "u8);
        writer.Write(16);
        writer.Write((short)1);
        writer.Write((short)1);
        writer.Write(8000);
        writer.Write(16000);
        writer.Write((short)2);
        writer.Write((short)16);
        writer.Write("data"u8);
        writer.Write(16000);
        writer.Write(new byte[16000]);
        return stream.ToArray();
    }
}
