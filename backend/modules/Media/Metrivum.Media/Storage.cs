using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.Options;
using Metrivum.BuildingBlocks;

namespace Metrivum.Media;

public sealed class StorageOptions
{
    public string Url { get; set; } = "";
    public string SecretKey { get; set; } = "";
    public string Bucket { get; set; } = "";
    public bool AllowRemoteStorage
    {
        get; set;
    }
    public long MaxAttachmentBytes { get; set; } = 52428800;
    public long MaxVoiceDurationMs { get; set; } = 300000;
    public string[] AllowedAttachmentTypes { get; set; } = ["image/png", "image/jpeg", "image/gif", "image/webp", "application/pdf", "text/plain", "application/zip", "video/mp4", "video/webm", "audio/wav"];
    public long MaxVideoBytes { get; set; } = 524288000;
    // Keep the configured physical bucket liability for signed-upload reservations. The
    // accepted analysis-video limit is stricter and must not under-reserve an issued token.
    public long AcceptedVideoBytes => Math.Min(MaxVideoBytes, 52428800);
    public int AcceptedPendingUploads => Math.Min(MaxPendingUploadsPerOwner, 3);
    public int MaxPendingUploadsPerOwner { get; set; } = 3;
    public int ReadUrlSeconds { get; set; } = 120;
}

public sealed record StoredObject(long Size, string ContentType, byte[] Prefix);
public interface IPrivateObjectStorage
{
    Task<string> CreateUploadUrlAsync(string bucket, string key, CancellationToken ct);
    Task<string> CreateReadUrlAsync(string bucket, string key, CancellationToken ct);
    Task<StoredObject> InspectAsync(string bucket, string key, CancellationToken ct);
    Task<Stream> OpenReadAsync(string bucket, string key, CancellationToken ct);
    Task DeleteAsync(string bucket, string key, CancellationToken ct);
}

public sealed class SupabaseObjectStorage(HttpClient client, IOptions<StorageOptions> configured) : IPrivateObjectStorage
{
    private readonly StorageOptions options = configured.Value;

    private HttpRequestMessage Request(HttpMethod method, string path)
    {
        if (!Uri.TryCreate(options.Url, UriKind.Absolute, out var url) || string.IsNullOrWhiteSpace(options.SecretKey) || string.IsNullOrWhiteSpace(options.Bucket))
            throw new ApiException(503, "STORAGE_NOT_CONFIGURED", "Private storage is not configured.");
        if ((!url.IsLoopback && (!options.AllowRemoteStorage || url.Scheme != "https")) || !string.IsNullOrEmpty(url.UserInfo) || !string.IsNullOrEmpty(url.Query))
            throw new ApiException(503, "STORAGE_CONFIGURATION_INVALID", "Remote storage requires explicit opt-in and HTTPS.");
        var request = new HttpRequestMessage(method, options.Url.TrimEnd('/') + "/storage/v1/" + path);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", options.SecretKey);
        request.Headers.Add("apikey", options.SecretKey);
        return request;
    }

    private static string Path(string bucket, string key) => Uri.EscapeDataString(bucket) + "/" + string.Join('/', key.Split('/').Select(Uri.EscapeDataString));

    private async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct, bool allowMissing = false)
    {
        HttpResponseMessage response;
        try
        {
            response = await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, ct);
        }
        catch (HttpRequestException) { throw new ApiException(503, "STORAGE_UNAVAILABLE", "Private storage is unavailable."); }
        catch (OperationCanceledException) when (!ct.IsCancellationRequested) { throw new ApiException(503, "STORAGE_UNAVAILABLE", "Private storage timed out."); }
        if (response.IsSuccessStatusCode || (allowMissing && response.StatusCode == HttpStatusCode.NotFound))
            return response;
        var status = response.StatusCode;
        response.Dispose();
        throw status == HttpStatusCode.NotFound
            ? new ApiException(409, "MEDIA_OBJECT_MISSING", "The stored object is missing.")
            : new ApiException(503, "STORAGE_UNAVAILABLE", "Private storage could not complete the operation.");
    }

    private async Task EnsurePrivateAsync(string bucket, CancellationToken ct, bool requireUploadLimit = false)
    {
        if (bucket != options.Bucket)
            throw new ApiException(503, "STORAGE_CONFIGURATION_INVALID", "Stored bucket does not match this environment.");
        using var request = Request(HttpMethod.Get, "bucket/" + Uri.EscapeDataString(bucket));
        using var response = await SendAsync(request, ct);
        using var json = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync(ct), cancellationToken: ct);
        if (!json.RootElement.TryGetProperty("public", out var value) || value.ValueKind != JsonValueKind.False)
            throw new ApiException(503, "STORAGE_BUCKET_NOT_PRIVATE", "The configured bucket must be private.");
        if (requireUploadLimit && (!json.RootElement.TryGetProperty("file_size_limit", out var max)
            || max.ValueKind != JsonValueKind.Number || !max.TryGetInt64(out var cap)
            || cap <= 0 || cap > Math.Max(options.MaxVideoBytes, options.MaxAttachmentBytes)))
            throw new ApiException(503, "STORAGE_BUCKET_LIMIT_REQUIRED", "Configure the private bucket file size limit before enabling direct uploads.");
    }

    public async Task<string> CreateUploadUrlAsync(string bucket, string key, CancellationToken ct)
    {
        await EnsurePrivateAsync(bucket, ct, requireUploadLimit: true);
        using var request = Request(HttpMethod.Post, "object/upload/sign/" + Path(bucket, key));
        request.Headers.Add("x-upsert", "false");
        request.Content = JsonContent.Create(new
        {
        });
        using var response = await SendAsync(request, ct);
        using var json = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync(ct), cancellationToken: ct);
        return SignedUrl(json.RootElement.GetProperty("url").GetString()!);
    }

    public async Task<string> CreateReadUrlAsync(string bucket, string key, CancellationToken ct)
    {
        await EnsurePrivateAsync(bucket, ct);
        using var request = Request(HttpMethod.Post, "object/sign/" + Path(bucket, key));
        request.Content = JsonContent.Create(new
        {
            expiresIn = options.ReadUrlSeconds
        });
        using var response = await SendAsync(request, ct);
        using var json = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync(ct), cancellationToken: ct);
        return SignedUrl(json.RootElement.GetProperty("signedURL").GetString()!);
    }

    private string SignedUrl(string relative)
    {
        if (!relative.StartsWith("/object/", StringComparison.Ordinal))
            throw new ApiException(503, "STORAGE_RESPONSE_INVALID", "Storage returned an invalid signed path.");
        return options.Url.TrimEnd('/') + "/storage/v1" + relative;
    }

    public async Task<StoredObject> InspectAsync(string bucket, string key, CancellationToken ct)
    {
        await EnsurePrivateAsync(bucket, ct);
        using var request = Request(HttpMethod.Get, "object/authenticated/" + Path(bucket, key));
        request.Headers.Range = new RangeHeaderValue(0, 4095);
        using var response = await SendAsync(request, ct);
        var size = response.Content.Headers.ContentRange?.Length ?? response.Content.Headers.ContentLength
            ?? throw new ApiException(503, "STORAGE_RESPONSE_INVALID", "Storage did not report object size.");
        var prefix = new byte[(int)Math.Min(size, 4096)];
        await using var stream = await response.Content.ReadAsStreamAsync(ct);
        var read = await stream.ReadAtLeastAsync(prefix, prefix.Length, false, ct);
        return new StoredObject(size, response.Content.Headers.ContentType?.MediaType ?? "", prefix[..read]);
    }

    public async Task<Stream> OpenReadAsync(string bucket, string key, CancellationToken ct)
    {
        await EnsurePrivateAsync(bucket, ct);
        using var request = Request(HttpMethod.Get, "object/authenticated/" + Path(bucket, key));
        var response = await SendAsync(request, ct);
        return new ResponseStream(await response.Content.ReadAsStreamAsync(ct), response);
    }

    public async Task DeleteAsync(string bucket, string key, CancellationToken ct)
    {
        await EnsurePrivateAsync(bucket, ct);
        using var request = Request(HttpMethod.Delete, "object/" + Uri.EscapeDataString(bucket));
        request.Content = JsonContent.Create(new
        {
            prefixes = new[] { key }
        });
        using var response = await SendAsync(request, ct, allowMissing: true);
    }

    private sealed class ResponseStream(Stream inner, HttpResponseMessage response) : Stream
    {
        public override bool CanRead => inner.CanRead;
        public override bool CanSeek => false;
        public override bool CanWrite => false;
        public override long Length => throw new NotSupportedException();
        public override long Position
        {
            get => throw new NotSupportedException(); set => throw new NotSupportedException();
        }
        public override int Read(byte[] buffer, int offset, int count) => inner.Read(buffer, offset, count);
        public override ValueTask<int> ReadAsync(Memory<byte> buffer, CancellationToken cancellationToken = default) => inner.ReadAsync(buffer, cancellationToken);
        public override void Flush() => throw new NotSupportedException();
        public override long Seek(long offset, SeekOrigin origin) => throw new NotSupportedException();
        public override void SetLength(long value) => throw new NotSupportedException();
        public override void Write(byte[] buffer, int offset, int count) => throw new NotSupportedException();
        protected override void Dispose(bool disposing)
        {
            if (disposing)
            {
                inner.Dispose();
                response.Dispose();
            }
            base.Dispose(disposing);
        }
        public override async ValueTask DisposeAsync()
        {
            await inner.DisposeAsync();
            response.Dispose();
            GC.SuppressFinalize(this);
        }
    }
}
