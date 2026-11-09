using System.Globalization;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Primitives;

namespace Metrivum.BuildingBlocks;

/// <summary>Validates HTTP version preconditions before optimistic-concurrency writes.</summary>
public static class RequestPreconditions
{
    public static long RequireVersion(HttpRequest request)
    {
        if (StringValues.IsNullOrEmpty(request.Headers.IfMatch))
            throw new ApiException(428, "VERSION_REQUIRED", "If-Match with the current ETag is required.");
        return ParseVersion(request.Headers.IfMatch)
            ?? throw ApiException.Invalid("If-Match must contain one strong numeric ETag.");
    }

    // Media and analysis retain their original error contract while sharing the same grammar.
    public static long RequireMediaVersion(HttpRequest request) => ParseVersion(request.Headers.IfMatch)
        ?? throw new ApiException(428, "IF_MATCH_REQUIRED", "Supply the current version in If-Match.");

    private static long? ParseVersion(StringValues values)
    {
        if (values.Count != 1 || values[0] is not { Length: >= 3 } value || value[0] != '"' || value[^1] != '"')
            return null;
        return long.TryParse(value.AsSpan(1, value.Length - 2), NumberStyles.None, CultureInfo.InvariantCulture, out var version) && version > 0
            ? version : null;
    }
}
