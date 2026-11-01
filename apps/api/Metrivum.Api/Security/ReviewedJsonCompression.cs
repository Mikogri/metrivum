using System.IO.Compression;
using Microsoft.AspNetCore.ResponseCompression;

namespace Metrivum.Api.Security;

public static class ReviewedJsonCompression
{
    // Opt in data-only reads. Auth, reflected message content, signed URLs and writes stay excluded.
    private static readonly HashSet<string> Paths = new(StringComparer.OrdinalIgnoreCase)
    {
        "/api/v1/exercise-dictionaries",
        "/api/v1/training/analysis-set-options",
        "/api/v1/training/assignments"
    };

    public static IServiceCollection AddReviewedJsonCompression(this IServiceCollection services)
    {
        services.AddResponseCompression(options =>
        {
            options.EnableForHttps = true;
            options.MimeTypes = ["application/json"];
            options.Providers.Add<BrotliCompressionProvider>();
            options.Providers.Add<GzipCompressionProvider>();
        });
        services.Configure<BrotliCompressionProviderOptions>(options => options.Level = CompressionLevel.Fastest);
        services.Configure<GzipCompressionProviderOptions>(options => options.Level = CompressionLevel.Fastest);
        return services;
    }

    public static IApplicationBuilder UseReviewedJsonCompression(this IApplicationBuilder app) =>
        app.UseWhen(context => HttpMethods.IsGet(context.Request.Method)
            && context.User.Identity?.IsAuthenticated == true
            && Paths.Contains(context.Request.Path.Value?.TrimEnd('/') ?? ""), branch => branch.UseResponseCompression());
}
