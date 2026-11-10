using System.Globalization;
using System.Security.Cryptography;
using System.Text;

namespace Metrivum.Billing.Infrastructure;

public sealed record ProviderCharge(
    string IdempotencyKey,
    decimal Amount,
    string Currency,
    string PaymentToken
);

public sealed record ProviderResult(
    bool Succeeded,
    string Reference,
    string? FailureCode,
    string Provider = "Simulated"
);

public interface IPaymentProvider
{
    Task<ProviderResult> ChargeAsync(ProviderCharge charge, CancellationToken ct);
}

// Deterministic across processes/restarts. Only opaque simulator tokens are accepted.
/// <summary>Returns deterministic simulated payment outcomes; never charges a real payment card.</summary>
public sealed class SimulatedPaymentProvider : IPaymentProvider
{
    public Task<ProviderResult> ChargeAsync(ProviderCharge charge, CancellationToken ct)
    {
        ct.ThrowIfCancellationRequested();
        var reference =
            "sim_"
            + Convert.ToHexStringLower(
                SHA256.HashData(
                    Encoding.UTF8.GetBytes(
                        charge.IdempotencyKey
                            + "|"
                            + charge.Amount.ToString("0.00", CultureInfo.InvariantCulture)
                            + "|"
                            + charge.Currency
                            + "|"
                            + charge.PaymentToken
                    )
                )
            );
        var succeeded =
            charge.Amount > 0
            && charge.PaymentToken.StartsWith("sim_success_", StringComparison.Ordinal);
        return Task.FromResult(
            new ProviderResult(succeeded, reference, succeeded ? null : "SIMULATED_DECLINE")
        );
    }
}
