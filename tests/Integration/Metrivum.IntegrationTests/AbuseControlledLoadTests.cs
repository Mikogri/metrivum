using System.Collections.Concurrent;
using System.Diagnostics;
using System.Net;
using System.Security.Claims;
using System.Text.Json;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Metrivum.Api.Security;
using Metrivum.BuildingBlocks;
using Xunit.Abstractions;

namespace Metrivum.IntegrationTests;

public sealed class AbuseControlledLoadTests(ITestOutputHelper output)
{
    [Fact]
    public async Task Synthetic_HTTP_before_after_load_and_attack_are_measured_without_database_or_remote_traffic()
    {
        var baseline = await Run(false);
        var protectedRun = await Run(true);
        Assert.Equal(0, baseline.NormalRejected);
        Assert.Equal(0, protectedRun.NormalRejected);
        Assert.Equal(0, baseline.BotRejected);
        Assert.Equal(700, protectedRun.BotRejected);
        var report = new { scope = "in-memory HTTP TestServer; synthetic handlers; no business writes, DB, storage or network; elapsed process memory includes test host",
            baseline, protectedRun };
        var json = JsonSerializer.Serialize(report, new JsonSerializerOptions { WriteIndented = true });
        output.WriteLine(json);
        if (Environment.GetEnvironmentVariable("TRAINFLOW_ABUSE_HTTP_RESULTS") is { } path) File.WriteAllText(path, json);
    }

    private static async Task<LoadResult> Run(bool enabled)
    {
        var builder = WebApplication.CreateBuilder(new WebApplicationOptions { EnvironmentName = "Testing" });
        builder.Logging.ClearProviders();
        builder.WebHost.UseTestServer();
        builder.Services.AddProblemDetails();
        builder.Services.AddAbuseHttpProtection(new ConfigurationBuilder().Build());
        await using var app = builder.Build();
        app.UseExceptionHandler(error => error.Run(async http =>
        {
            var exception = http.Features.Get<Microsoft.AspNetCore.Diagnostics.IExceptionHandlerFeature>()?.Error;
            if (exception is not ApiException { Status: 429 } limit) throw new InvalidOperationException("Unexpected synthetic host error.", exception);
            http.Response.Headers.RetryAfter = Math.Max(1, (int)Math.Ceiling(limit.RetryAfter!.Value.TotalSeconds)).ToString();
            await Results.Problem(statusCode: 429, title: limit.Code).ExecuteAsync(http);
        }));
        // This identity header exists only inside this isolated test server; production uses the real JWT middleware.
        app.Use(async (http, next) =>
        {
            http.User = new ClaimsPrincipal(new ClaimsIdentity([new Claim("sub", http.Request.Headers["Synthetic-User"].ToString())], "synthetic-test"));
            await next(http);
        });
        if (enabled) app.UseAbuseHttpProtection();
        app.MapGet("/api/v1/synthetic/{id}", () => Results.NoContent());
        app.MapPut("/api/v1/training/programs/{id}/draft", (HttpContext http, IAbuseProtection guard) =>
        {
            if (enabled) guard.Require(Guid.Parse(http.User.FindFirst("sub")!.Value), AbusePolicies.Autosave);
            return Results.NoContent();
        });
        await app.StartAsync();
        using var client = app.GetTestClient();
        // Warm the pipeline and native partition factories before the measured normal load.
        using (var warmup = new HttpRequestMessage(HttpMethod.Get, "/api/v1/synthetic/warmup"))
        { warmup.Headers.Add("Synthetic-User", Guid.NewGuid().ToString()); using var response = await client.SendAsync(warmup); }
        var samples = new ConcurrentBag<double>(); var rejected = 0; var unexpected = 0;
        var process = Process.GetCurrentProcess(); var cpu = process.TotalProcessorTime; var timer = Stopwatch.StartNew();
        await Parallel.ForEachAsync(Enumerable.Range(0, 100), new ParallelOptions { MaxDegreeOfParallelism = 16 }, async (_, ct) =>
        {
            var user = Guid.NewGuid().ToString();
            for (var i = 0; i < 200; i++)
            {
                using var request = new HttpRequestMessage(i < 100 ? HttpMethod.Get : HttpMethod.Put,
                    i < 100 ? "/api/v1/synthetic/" + i : "/api/v1/training/programs/one/draft");
                request.Headers.Add("Synthetic-User", user);
                var start = Stopwatch.GetTimestamp();
                using var response = await client.SendAsync(request, ct);
                samples.Add(Stopwatch.GetElapsedTime(start).TotalMilliseconds);
                if (response.StatusCode == HttpStatusCode.TooManyRequests) Interlocked.Increment(ref rejected);
                else if (response.StatusCode != HttpStatusCode.NoContent) Interlocked.Increment(ref unexpected);
            }
        });
        timer.Stop(); var botRejected = 0; var bot = Guid.NewGuid().ToString();
        for (var i = 0; i < 1000; i++)
        {
            using var request = new HttpRequestMessage(HttpMethod.Get, "/api/v1/synthetic/" + i);
            request.Headers.Add("Synthetic-User", bot);
            using var response = await client.SendAsync(request);
            if (response.StatusCode == HttpStatusCode.TooManyRequests) { botRejected++; Assert.NotNull(response.Headers.RetryAfter); }
            else Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        }
        Assert.Equal(0, unexpected);
        var sorted = samples.Order().ToArray();
        return new(enabled, 100, sorted.Length, rejected, botRejected, sorted[sorted.Length / 2], sorted[(int)(sorted.Length * .95)],
            sorted.Length / timer.Elapsed.TotalSeconds, timer.Elapsed.TotalSeconds, (process.TotalProcessorTime - cpu).TotalMilliseconds, process.WorkingSet64);
    }

    private sealed record LoadResult(bool Enabled, int Users, int Requests, int NormalRejected, int BotRejected, double P50Milliseconds,
        double P95Milliseconds, double RequestsPerSecond, double ElapsedSeconds, double CpuMilliseconds, long WorkingSetBytes);
}
