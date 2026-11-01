using System.Net;
using System.Net.Http.Headers;
using System.Text;
using Microsoft.Extensions.Options;
using Metrivum.BuildingBlocks;
using Metrivum.Media;

namespace Metrivum.UnitTests;

public class MediaStorageTests
{
    [Fact]
    public async Task PublicBucketCannotIssueSignedUpload()
    {
        var handler = new StubHandler(_ => Json("{\"public\":true}"));
        var storage = Adapter(handler);
        Assert.Equal("STORAGE_BUCKET_NOT_PRIVATE", (await Assert.ThrowsAsync<ApiException>(() => storage.CreateUploadUrlAsync("test-private", "owner/video.mp4", default))).Code);
        Assert.Equal(1, handler.Calls);
    }

    [Fact]
    public async Task SignedUploadNeverAllowsOverwriteAndUsesServerBucket()
    {
        var handler = new StubHandler(request =>
        {
            Assert.Equal("secret-test-value", request.Headers.Authorization!.Parameter);
            if (request.RequestUri!.AbsolutePath.StartsWith("/storage/v1/bucket/"))
                return Json("{\"public\":false,\"file_size_limit\":524288000}");
            Assert.Equal(HttpMethod.Post, request.Method);
            Assert.Equal("/storage/v1/object/upload/sign/test-private/owner/video.mp4", request.RequestUri.AbsolutePath);
            Assert.Equal("false", Assert.Single(request.Headers.GetValues("x-upsert")));
            return Json("{\"url\":\"/object/upload/sign/test-private/owner/video.mp4?token=test\"}");
        });
        var url = await Adapter(handler).CreateUploadUrlAsync("test-private", "owner/video.mp4", default);
        Assert.Equal("http://127.0.0.1:54321/storage/v1/object/upload/sign/test-private/owner/video.mp4?token=test", url);
    }

    [Theory]
    [InlineData("{\"public\":false}")]
    [InlineData("{\"public\":false,\"file_size_limit\":null}")]
    [InlineData("{\"public\":false,\"file_size_limit\":\"524288000\"}")]
    [InlineData("{\"public\":false,\"file_size_limit\":0}")]
    [InlineData("{\"public\":false,\"file_size_limit\":524288001}")]
    public async Task Missing_or_unsafe_bucket_cap_cannot_issue_upload_capability(string limits)
    {
        var handler = new StubHandler(_ => Json(limits));
        var error = await Assert.ThrowsAsync<ApiException>(() => Adapter(handler).CreateUploadUrlAsync("test-private", "video.mp4", default));
        Assert.Equal("STORAGE_BUCKET_LIMIT_REQUIRED", error.Code);
        Assert.Equal(1, handler.Calls);
    }

    [Fact]
    public async Task InspectionUsesActualRangeLengthAndContainerPrefix()
    {
        var handler = new StubHandler(request =>
        {
            if (request.RequestUri!.AbsolutePath.StartsWith("/storage/v1/bucket/"))
                return Json("{\"public\":false}");
            Assert.Equal("bytes=0-4095", request.Headers.Range!.ToString());
            var content = new ByteArrayContent(new byte[4096]);
            content.Headers.ContentRange = new ContentRangeHeaderValue(0, 4095, 100000);
            content.Headers.ContentType = new MediaTypeHeaderValue("video/mp4");
            return new HttpResponseMessage(HttpStatusCode.PartialContent) { Content = content };
        });
        var actual = await Adapter(handler).InspectAsync("test-private", "video.mp4", default);
        Assert.Equal(100000, actual.Size);
        Assert.Equal(4096, actual.Prefix.Length);
    }

    [Fact]
    public async Task RemoteStorageRequiresExplicitOptIn()
    {
        var handler = new StubHandler(_ => throw new InvalidOperationException("No request expected"));
        var adapter = new SupabaseObjectStorage(new HttpClient(handler), Options.Create(new StorageOptions { Url = "https://production.example", Bucket = "test-private", SecretKey = "test" }));
        Assert.Equal("STORAGE_CONFIGURATION_INVALID", (await Assert.ThrowsAsync<ApiException>(() => adapter.InspectAsync("test-private", "video.mp4", default))).Code);
        Assert.Equal(0, handler.Calls);
    }

    [Fact]
    public async Task MissingObjectIsReportedWithoutProviderDetails()
    {
        var handler = new StubHandler(request => request.RequestUri!.AbsolutePath.StartsWith("/storage/v1/bucket/")
            ? Json("{\"public\":false}") : new(HttpStatusCode.NotFound)
            {
                Content = new StringContent("sensitive-provider-response")
            });
        var error = await Assert.ThrowsAsync<ApiException>(() => Adapter(handler).InspectAsync("test-private", "video.mp4", default));
        Assert.Equal("MEDIA_OBJECT_MISSING", error.Code);
        Assert.DoesNotContain("sensitive", error.Message);
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public async Task AllOperationsUseKeySpecificAuthentication(bool opaqueKey)
    {
        // Deliberately invalid credentials: no real key or signed JWT belongs in tests.
        var key = opaqueKey ? "sb_secret_fake" : "test-header.test-payload.test-signature";
        var handler = new StubHandler(request =>
        {
            Assert.Equal(key, Assert.Single(request.Headers.GetValues("apikey")));
            if (opaqueKey)
                Assert.Null(request.Headers.Authorization);
            else
            {
                Assert.Equal("Bearer", request.Headers.Authorization?.Scheme);
                Assert.Equal(key, request.Headers.Authorization?.Parameter);
            }
            var path = request.RequestUri!.AbsolutePath;
            if (path.StartsWith("/storage/v1/bucket/"))
                return Json("{\"public\":false,\"file_size_limit\":52428800}");
            if (path.Contains("/upload/sign/"))
            {
                Assert.Equal(HttpMethod.Post, request.Method);
                Assert.Equal("false", Assert.Single(request.Headers.GetValues("x-upsert")));
                return Json("{\"url\":\"/object/upload/sign/test-private/video.mp4?token=test\"}");
            }
            if (path.Contains("/object/sign/"))
            {
                Assert.Equal(HttpMethod.Post, request.Method);
                return Json("{\"signedURL\":\"/object/sign/test-private/video.mp4?token=test\"}");
            }
            if (request.Method == HttpMethod.Delete)
                return Json("[]");
            Assert.Equal(HttpMethod.Get, request.Method);
            Assert.Equal("/storage/v1/object/authenticated/test-private/video.mp4", path);
            var content = new ByteArrayContent([1, 2, 3]);
            content.Headers.ContentType = new MediaTypeHeaderValue("video/mp4");
            if (request.Headers.Range is not null)
            {
                Assert.Equal("bytes=0-4095", request.Headers.Range.ToString());
                content.Headers.ContentRange = new ContentRangeHeaderValue(0, 2, 3);
            }
            return new HttpResponseMessage(HttpStatusCode.OK) { Content = content };
        });
        var storage = new SupabaseObjectStorage(new HttpClient(handler), Options.Create(new StorageOptions
        {
            Url = "https://storage.example.invalid",
            AllowRemoteStorage = true,
            Bucket = "test-private",
            SecretKey = key
        }));
        Assert.Contains("/object/upload/sign/", await storage.CreateUploadUrlAsync("test-private", "video.mp4", default));
        Assert.Contains("/object/sign/", await storage.CreateReadUrlAsync("test-private", "video.mp4", default));
        var inspected = await storage.InspectAsync("test-private", "video.mp4", default);
        Assert.Equal(3, inspected.Size);
        Assert.Equal(new byte[] { 1, 2, 3 }, inspected.Prefix);
        await using var stream = await storage.OpenReadAsync("test-private", "video.mp4", default);
        using var bytes = new MemoryStream();
        await stream.CopyToAsync(bytes);
        Assert.Equal(new byte[] { 1, 2, 3 }, bytes.ToArray());
        await storage.DeleteAsync("test-private", "video.mp4", default);
        Assert.Equal(10, handler.Calls); // Each operation first verifies bucket privacy.
    }
    private static SupabaseObjectStorage Adapter(HttpMessageHandler handler) => new(new HttpClient(handler), Options.Create(new StorageOptions
    {
        Url = "http://127.0.0.1:54321",
        SecretKey = "secret-test-value",
        Bucket = "test-private"
    }));
    private static HttpResponseMessage Json(string json) => new(HttpStatusCode.OK) { Content = new StringContent(json, Encoding.UTF8, "application/json") };
    private sealed class StubHandler(Func<HttpRequestMessage, HttpResponseMessage> response) : HttpMessageHandler
    {
        public int Calls;
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Calls++;
            return Task.FromResult(response(request));
        }
    }
}
