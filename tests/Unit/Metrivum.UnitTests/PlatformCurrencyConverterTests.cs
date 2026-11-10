using System.Net;
using Metrivum.Billing.Infrastructure;
using Metrivum.BuildingBlocks;
using Microsoft.Extensions.Caching.Memory;

namespace Metrivum.UnitTests;

public sealed class PlatformCurrencyConverterTests
{
    private sealed class Clock : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => new(2026, 10, 8, 12, 0, 0, TimeSpan.Zero);
    }

    private sealed class Handler(string body, HttpStatusCode status = HttpStatusCode.OK)
        : HttpMessageHandler
    {
        public int Calls { get; private set; }
        public Uri? Uri { get; private set; }

        protected override Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request,
            CancellationToken ct
        )
        {
            Calls++;
            Uri = request.RequestUri;
            return Task.FromResult(
                new HttpResponseMessage(status) { Content = new StringContent(body) }
            );
        }
    }

    [Fact]
    public async Task Same_currency_needs_no_network_or_new_price_version()
    {
        using var handler = new Handler("unavailable", HttpStatusCode.ServiceUnavailable);
        using var http = new HttpClient(handler)
        {
            BaseAddress = new("https://api.frankfurter.dev/"),
        };
        using var cache = new MemoryCache(new MemoryCacheOptions());
        var converter = new PlatformCurrencyConverter(http, cache, new Clock());
        var quote = await converter.ConvertAsync(25m, "USD", "USD", default);
        Assert.Equal(25m, quote.Amount);
        Assert.Equal("", quote.Version);
        Assert.Equal(0, handler.Calls);
    }

    [Fact]
    public async Task Converts_using_server_rate_and_caches_rate_not_amount()
    {
        using var handler = new Handler(
            """{"date":"2026-10-08","base":"USD","quote":"PLN","rate":3.9114}"""
        );
        using var http = new HttpClient(handler)
        {
            BaseAddress = new("https://api.frankfurter.dev/"),
        };
        using var cache = new MemoryCache(new MemoryCacheOptions());
        var converter = new PlatformCurrencyConverter(http, cache, new Clock());
        var pro = await converter.ConvertAsync(25m, "USD", "PLN", default);
        var team = await converter.ConvertAsync(20m, "USD", "PLN", default);
        Assert.Equal(97.79m, pro.Amount);
        Assert.Equal(78.23m, team.Amount);
        Assert.Equal("PLN", pro.Currency);
        Assert.Equal("2026-10-08", pro.AsOf);
        Assert.Equal(pro.Version, team.Version);
        Assert.NotEmpty(pro.Version);
        Assert.Equal(1, handler.Calls);
        Assert.EndsWith("/v2/providers/ecb/rate/USD/PLN", handler.Uri!.AbsoluteUri);
    }

    [Theory]
    [InlineData("{\"date\":\"2026-10-08\",\"base\":\"USD\",\"quote\":\"EUR\",\"rate\":3.9}")]
    [InlineData("{\"date\":\"2026-09-01\",\"base\":\"USD\",\"quote\":\"PLN\",\"rate\":3.9}")]
    [InlineData("{\"date\":\"2026-10-09\",\"base\":\"USD\",\"quote\":\"PLN\",\"rate\":3.9}")]
    [InlineData("{\"date\":\"2026-10-08\",\"base\":\"USD\",\"quote\":\"PLN\",\"rate\":0}")]
    [InlineData("not json")]
    public async Task Invalid_or_stale_rates_never_produce_a_payable_quote(string body)
    {
        using var handler = new Handler(body);
        using var http = new HttpClient(handler)
        {
            BaseAddress = new("https://api.frankfurter.dev/"),
        };
        using var cache = new MemoryCache(new MemoryCacheOptions());
        var error = await Assert.ThrowsAsync<ApiException>(() =>
            new PlatformCurrencyConverter(http, cache, new Clock()).ConvertAsync(
                25m,
                "USD",
                "PLN",
                default
            )
        );
        Assert.Equal("EXCHANGE_RATE_UNAVAILABLE", error.Code);
    }
}
