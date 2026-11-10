using System.Net.Http.Headers;
using System.Net.Http.Json;
using Metrivum.Media;
using Microsoft.Extensions.Options;

namespace Metrivum.IntegrationTests;

public sealed class MediaSupabaseTests
{
    [MediaSupabaseFact]
    public async Task LocalPrivateStorageSupportsNoOverwriteUploadInspectReadAndDelete()
    {
        var url = Environment.GetEnvironmentVariable("TRAINFLOW_TEST_SUPABASE_URL")!;
        var key = Environment.GetEnvironmentVariable("TRAINFLOW_TEST_SUPABASE_SERVICE_KEY")!;
        Assert.True(
            new Uri(url).IsLoopback,
            "This destructive integration test runs only against local Supabase."
        );
        var bucket = "trainflow-test-" + Guid.NewGuid().ToString("N");
        using var admin = new HttpClient
        {
            BaseAddress = new Uri(url.TrimEnd('/') + "/storage/v1/"),
            Timeout = TimeSpan.FromSeconds(15),
        };
        admin.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", key);
        admin.DefaultRequestHeaders.Add("apikey", key);
        using var created = await admin.PostAsJsonAsync(
            "bucket",
            new
            {
                id = bucket,
                name = bucket,
                @public = false,
                file_size_limit = 1048576,
                allowed_mime_types = new[] { "video/mp4" },
            }
        );
        Assert.True(
            created.IsSuccessStatusCode,
            $"Local test bucket creation returned HTTP {(int)created.StatusCode}."
        );
        try
        {
            using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(15) };
            var storage = new SupabaseObjectStorage(
                http,
                Options.Create(
                    new StorageOptions
                    {
                        Url = url,
                        SecretKey = key,
                        Bucket = bucket,
                    }
                )
            );
            const string path = "owner/videos/test.mp4";
            var uploadUrl = await storage.CreateUploadUrlAsync(bucket, path, default);
            byte[] video =
            [
                0,
                0,
                0,
                24,
                102,
                116,
                121,
                112,
                105,
                115,
                111,
                109,
                0,
                0,
                0,
                0,
                105,
                115,
                111,
                109,
                0,
                0,
                0,
                0,
            ];
            using var bytes = new ByteArrayContent(video);
            bytes.Headers.ContentType = new MediaTypeHeaderValue("video/mp4");
            using var uploaded = await http.PutAsync(uploadUrl, bytes);
            Assert.True(
                uploaded.IsSuccessStatusCode,
                $"Local signed upload returned HTTP {(int)uploaded.StatusCode}."
            );
            using var overwriteBytes = new ByteArrayContent(video);
            overwriteBytes.Headers.ContentType = new MediaTypeHeaderValue("video/mp4");
            using var overwrite = await http.PutAsync(uploadUrl, overwriteBytes);
            Assert.False(overwrite.IsSuccessStatusCode);
            var actual = await storage.InspectAsync(bucket, path, default);
            Assert.Equal(video.Length, actual.Size);
            Assert.Equal(video, actual.Prefix);
            VideoFileValidation.Validate(
                "video/mp4",
                video.Length,
                actual.Size,
                actual.Prefix,
                1048576
            );
            var readUrl = await storage.CreateReadUrlAsync(bucket, path, default);
            Assert.Equal(video, await http.GetByteArrayAsync(readUrl));
            await storage.DeleteAsync(bucket, path, default);
        }
        finally
        {
            using var emptied = await admin.PostAsJsonAsync("bucket/" + bucket + "/empty", new { });
            using var removed = await admin.DeleteAsync("bucket/" + bucket);
            Assert.True(
                removed.IsSuccessStatusCode,
                $"Local test bucket cleanup returned HTTP {(int)removed.StatusCode}."
            );
        }
    }
}

public sealed class MediaSupabaseFactAttribute : FactAttribute
{
    public MediaSupabaseFactAttribute()
    {
        if (
            string.IsNullOrWhiteSpace(
                Environment.GetEnvironmentVariable("TRAINFLOW_TEST_SUPABASE_URL")
            )
            || string.IsNullOrWhiteSpace(
                Environment.GetEnvironmentVariable("TRAINFLOW_TEST_SUPABASE_SERVICE_KEY")
            )
        )
            Skip =
                "Set TRAINFLOW_TEST_SUPABASE_URL and TRAINFLOW_TEST_SUPABASE_SERVICE_KEY for a local Supabase instance.";
    }
}
