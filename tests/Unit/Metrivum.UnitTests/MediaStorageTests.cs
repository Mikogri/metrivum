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
