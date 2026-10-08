using System.Globalization;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.Caching.Memory;
using TrainFlow.BuildingBlocks;

namespace TrainFlow.Billing.Infrastructure;

public sealed record PlatformCurrencyQuote(decimal Amount, string Currency, string Version, string Source, string AsOf);
public interface IPlatformCurrencyConverter
{
    Task<PlatformCurrencyQuote> ConvertAsync(decimal amount, string baseCurrency, string targetCurrency, CancellationToken ct);
}

public sealed class PlatformCurrencyConverter(HttpClient http, IMemoryCache cache, TimeProvider clock) : IPlatformCurrencyConverter
{
    public async Task<PlatformCurrencyQuote> ConvertAsync(decimal amount, string baseCurrency, string targetCurrency, CancellationToken ct)
    {
        if (amount < 0 || !Supported(baseCurrency) || !Supported(targetCurrency))
            throw ApiException.Invalid("Unsupported price or currency.");
        if (baseCurrency == targetCurrency)
            return new(amount, targetCurrency, "", "Base price", "");
        var today = DateOnly.FromDateTime(clock.GetUtcNow().UtcDateTime);
        var key = $"platform-fx:{baseCurrency}:{targetCurrency}";
        if (!cache.TryGetValue<RateResponse>(key, out var rate) || rate == null || !Valid(rate, baseCurrency, targetCurrency, today))
        {
            try
            {
                rate = await http.GetFromJsonAsync<RateResponse>($"v2/providers/ecb/rate/{baseCurrency}/{targetCurrency}", ct);
                if (rate == null || !Valid(rate, baseCurrency, targetCurrency, today))
                    throw Unavailable();
                cache.Set(key, rate, TimeSpan.FromHours(1));
            }
            catch (HttpRequestException) { throw Unavailable(); }
            catch (JsonException) { throw Unavailable(); }
            catch (OperationCanceledException) when (!ct.IsCancellationRequested) { throw Unavailable(); }
        }
        // The price version freezes the rate used at checkout; never accept a browser-supplied amount.
        var date = rate.Date.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
        var version = $"{baseCurrency}-{targetCurrency}-{date}-{rate.Rate.ToString(CultureInfo.InvariantCulture)}";
        return new(decimal.Round(amount * rate.Rate, 2, MidpointRounding.AwayFromZero), targetCurrency, version, "ECB via Frankfurter", date);
    }

    private static bool Valid(RateResponse rate, string from, string to, DateOnly today) =>
        rate.Base == from && rate.Quote == to && rate.Rate > 0 && rate.Rate < 1000000m && rate.Date <= today && rate.Date >= today.AddDays(-7);
    private static bool Supported(string currency) => currency is "EUR" or "PLN" or "USD" or "GBP" or "CHF" or "CZK" or "SEK" or "NOK" or "DKK" or "CAD" or "AUD";
    private static ApiException Unavailable() => new(503, "EXCHANGE_RATE_UNAVAILABLE", "Currency conversion is temporarily unavailable. Please try again before paying.");
    private sealed record RateResponse(DateOnly Date, string Base, string Quote, decimal Rate);
}
