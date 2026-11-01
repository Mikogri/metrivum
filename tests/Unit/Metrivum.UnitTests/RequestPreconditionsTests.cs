using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Primitives;
using Metrivum.BuildingBlocks;

namespace Metrivum.UnitTests;

public sealed class RequestPreconditionsTests
{
    [Theory]
    [InlineData("\"1\"", 1L)]
    [InlineData("\"001\"", 1L)]
    [InlineData("\"9223372036854775807\"", long.MaxValue)]
    public void Reads_one_positive_strong_numeric_version(string header, long expected)
    {
        var request = new DefaultHttpContext().Request;
        request.Headers.IfMatch = header;
        Assert.Equal(expected, RequestPreconditions.RequireVersion(request));
    }

    [Theory]
    [InlineData("1")]
    [InlineData("\"1")]
    [InlineData("1\"")]
    [InlineData("\"\"1\"\"")]
    [InlineData("W/\"1\"")]
    [InlineData("*")]
    [InlineData("\"1\", \"2\"")]
    [InlineData("\"+1\"")]
    [InlineData("\" 1 \"")]
    [InlineData("\"0\"")]
    [InlineData("\"-1\"")]
    [InlineData("\"9223372036854775808\"")]
    public void Rejects_invalid_versions_before_a_write(string header)
    {
        var request = new DefaultHttpContext().Request;
        request.Headers.IfMatch = header;
        var error = Assert.Throws<ApiException>(() => RequestPreconditions.RequireVersion(request));
        Assert.Equal(400, error.Status);
        Assert.Equal("VALIDATION_FAILED", error.Code);
        var legacy = Assert.Throws<ApiException>(() => RequestPreconditions.RequireMediaVersion(request));
        Assert.Equal(428, legacy.Status);
        Assert.Equal("IF_MATCH_REQUIRED", legacy.Code);
    }

    [Fact]
    public void Rejects_multiple_header_values()
    {
        var request = new DefaultHttpContext().Request;
        request.Headers.IfMatch = new StringValues(["\"1\"", "\"2\""]);
        Assert.Equal(400, Assert.Throws<ApiException>(() => RequestPreconditions.RequireVersion(request)).Status);
    }

    [Theory]
    [InlineData("VERSION_REQUIRED")]
    [InlineData("IF_MATCH_REQUIRED")]
    public void Preserves_the_endpoint_missing_precondition_code(string code)
    {
        var error = Assert.Throws<ApiException>(() => code == "VERSION_REQUIRED" ? RequestPreconditions.RequireVersion(new DefaultHttpContext().Request) : RequestPreconditions.RequireMediaVersion(new DefaultHttpContext().Request));
        Assert.Equal(428, error.Status);
        Assert.Equal(code, error.Code);
    }
}
