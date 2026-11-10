using Metrivum.Billing.Features;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace Metrivum.Billing.Infrastructure;

/// <summary>Runs scheduled billing processing in Billing through the owning services.</summary>
public sealed class BillingWorker(IServiceScopeFactory scopes, ILogger<BillingWorker> logger)
    : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(30));
        do
        {
            try
            {
                await Run<TeamService>(
                    (service, ct) => service.ProcessTransitionsAsync(50, ct),
                    stoppingToken
                );
                await Run<TeamBillingService>(
                    (service, ct) => service.ProcessRenewalsAsync(50, ct),
                    stoppingToken
                );
                await Run<BillingService>(
                    (service, ct) => service.GenerateRenewalsAsync(50, ct),
                    stoppingToken
                );
                await Run<PlatformSubscriptionService>(
                    (service, ct) => service.ProcessRenewalsAsync(50, ct),
                    stoppingToken
                );
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception error)
            {
                logger.LogError(
                    error,
                    "Billing renewal generation failed; durable subscriptions remain pending."
                );
            }
        } while (await timer.WaitForNextTickAsync(stoppingToken));
    }

    private async Task Run<T>(Func<T, CancellationToken, Task<int>> work, CancellationToken ct)
        where T : notnull
    {
        // An unresolved organizational obligation must not block unrelated subscription renewals.
        try
        {
            await using var scope = scopes.CreateAsyncScope();
            await work(scope.ServiceProvider.GetRequiredService<T>(), ct);
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception error)
        {
            logger.LogError(
                error,
                "Billing pass {Service} failed; durable work remains pending.",
                typeof(T).Name
            );
        }
    }
}
