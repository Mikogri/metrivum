using Metrivum.Analytics.Contracts;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Metrivum.Access.Contracts;
using Metrivum.Billing.Contracts;
using Metrivum.Billing.Domain;
using Metrivum.Billing.Features;
using Metrivum.Billing.Infrastructure;
using Metrivum.BuildingBlocks;

namespace Metrivum.Billing;

public static class ModuleRegistration
{
    public static IServiceCollection AddBilling(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddPlanEntitlements();
        services.AddScoped<BillingService>();
        services.AddScoped<TransactionHistoryService>();
        services.AddScoped<PlatformSubscriptionService>();
        services.AddScoped<PlatformRefundService>();
        services.AddScoped<TeamService>();
        services.AddScoped<TeamBillingService>();
        services.AddMemoryCache();
        services.AddHttpClient<IPlatformCurrencyConverter, PlatformCurrencyConverter>(http => { http.BaseAddress = new Uri("https://api.frankfurter.dev/"); http.Timeout = TimeSpan.FromSeconds(10); });
        services.AddScoped<Metrivum.Notifications.Contracts.INotificationDeliveryPolicy, BillingNotificationPolicy>();
        services.AddScoped<IFinanceAnalytics, BillingAnalytics>();
        services.AddScoped<IBillingOrders>(p => p.GetRequiredService<BillingService>());
        services.AddScoped<IPlatformPlans>(p => p.GetRequiredService<BillingService>());
        services.AddScoped<ILimitUsageProvider, CoachSeatUsage>();
        services.TryAddSingleton<IPaymentProvider, SimulatedPaymentProvider>();
        services.TryAddSingleton(TimeProvider.System);
        foreach (var key in new[] { "billing.manage", "billing.read-own", "billing.pay-own" })
            services.AddSingleton(new FeatureDefinition(key, "Billing", key + ".title", key + ".description", [], []));
        return services;
    }
    // Workers read entitlement projections without registering payment or HTTP-facing services.
    public static IServiceCollection AddPlanEntitlements(this IServiceCollection services)
    {
        services.AddModuleDatabase<BillingDbContext>("billing");
        services.AddScoped<Metrivum.Accounts.Contracts.ITeamContext, TeamContext>();
        services.AddScoped<IPlanEntitlementsProvider, PlanEntitlementsProvider>();
        services.TryAddSingleton(TimeProvider.System);
        return services;
    }
    // Host explicitly invokes this only outside Testing; the worker is a driver for persisted schedules.
    public static IServiceCollection AddBillingWorker(this IServiceCollection services)
    {
        services.AddHostedService<BillingWorker>();
        return services;
    }
    public static IEndpointRouteBuilder MapBilling(this IEndpointRouteBuilder endpoints)
    {
        var me = endpoints.MapGroup("/api/v1/me").WithTags("Billing").RequireAuthorization();
        me.MapGet("/transactions", ([AsParameters] TransactionHistoryQuery query, TransactionHistoryService service, CancellationToken ct) => service.ListAsync(query, ct));
        me.MapGet("/transactions/summary", (DateTimeOffset? from, DateTimeOffset? to, Guid? teamId, TransactionHistoryService service, CancellationToken ct) => service.SummaryAsync(from, to, teamId, ct));
        me.MapGet("/transactions/{id:guid}", (Guid id, Guid? teamId, TransactionHistoryService service, CancellationToken ct) => service.DetailAsync(id, teamId, ct));
        me.MapGet("/payment-methods", (BillingService s, CancellationToken ct) => s.MethodsAsync(ct));
        me.MapPost("/payment-methods/simulated-card", (SimulatedMethodRequest r, BillingService s, CancellationToken ct) => s.AddMethodAsync(r, ct));
        me.MapDelete("/payment-methods/{id:guid}", async (Guid id, BillingService s, CancellationToken ct) => { await s.RemoveMethodAsync(id, ct); return Results.NoContent(); });
        me.MapGet("/service-subscriptions", (BillingService s, CancellationToken ct) => s.ServiceSubscriptionsAsync(ct));
        me.MapPost("/service-subscriptions/{id:guid}/renewal", async (Guid id, ServiceRenewalRequest r, BillingService s, CancellationToken ct) => { await s.SetServiceRenewalAsync(id, r, ct); return Results.NoContent(); });
        me.MapGet("/payment-history", (int? page, int? pageSize, BillingService s, CancellationToken ct) => s.PaymentHistoryAsync(page ?? 1, pageSize ?? 25, ct));
        me.MapGet("/orders", (int? page, int? pageSize, string? sort, BillingService s, CancellationToken ct) => s.OrdersAsync(page ?? 1, pageSize ?? 25, sort ?? "created", ct));
        me.MapGet("/plan-purchases/by-application/{applicationId:guid}/due", (Guid applicationId, BillingService s, CancellationToken ct) => s.PlanPurchaseApplicationDueAsync(applicationId, ct));
        me.MapGet("/plan-purchases/{orderId:guid}/due", (Guid orderId, BillingService s, CancellationToken ct) => s.PlanPurchaseDueAsync(orderId, ct));
        me.MapGet("/payment-dues", (int? page, int? pageSize, DueStatus? status, string? sort, BillingService s, CancellationToken ct) => s.DuesAsync(page ?? 1, pageSize ?? 25, status, sort ?? "due", ct));
        me.MapPost("/payment-dues/{id:guid}/confirm-payment", (Guid id, PayRequest r, BillingService s, CancellationToken ct) => s.PayAsync(id, r, ct));
        me.MapPost("/payment-dues/{id:guid}/pay", (Guid id, PayRequest r, BillingService s, CancellationToken ct) => s.PayAsync(id, r, ct));
        endpoints.MapGet("/api/v1/subscriptions/plans", (PlatformSubscriptionService s, CancellationToken ct) => s.PlansAsync(ct)).WithTags("PlatformSubscriptions").RequireAuthorization();
        endpoints.MapGet("/api/v1/subscriptions/catalog", (PlatformSubscriptionService s) => s.Catalog()).WithTags("PlatformSubscriptions").AllowAnonymous();
        me.MapGet("/platform-subscription", (PlatformSubscriptionService s, CancellationToken ct) => s.CurrentAsync(ct));
        me.MapPost("/platform-subscription/checkout", (PlatformCheckoutRequest r, PlatformSubscriptionService s, CancellationToken ct) => s.CheckoutAsync(r, ct));
        me.MapPost("/platform-subscription/confirm-payment", (PlatformConfirmRequest r, PlatformSubscriptionService s, CancellationToken ct) => s.ConfirmAsync(r, ct));
        me.MapPost("/platform-subscription/change-plan", (PlatformChangeRequest r, PlatformSubscriptionService s, CancellationToken ct) => s.ChangeAsync(r, ct));
        me.MapPost("/platform-subscription/renewal", (PlatformRenewalRequest r, PlatformSubscriptionService s, CancellationToken ct) => s.RenewalAsync(r, ct));
        me.MapPost("/platform-subscription/cancel-renewal", (PlatformVersionRequest r, PlatformSubscriptionService s, CancellationToken ct) => s.CancelAsync(r, ct));
        me.MapPost("/platform-payments/{paymentId:guid}/simulated-refund", (Guid paymentId, SimulatedRefundRequest r, PlatformRefundService s, CancellationToken ct) => s.RefundAsync(paymentId, r, ct));
        me.MapGet("/platform-subscription/history", (PlatformSubscriptionService s, CancellationToken ct) => s.HistoryAsync(ct));
        var teams = endpoints.MapGroup("/api/v1/teams").WithTags("Teams").RequireAuthorization();
        teams.MapPost("/checkout-quote", (TeamCheckoutQuoteRequest r, TeamBillingService s, CancellationToken ct) => s.QuoteAsync(r, ct));
        teams.MapPost("/confirm-purchase", (TeamPaymentConfirmRequest r, TeamBillingService s, CancellationToken ct) => s.ConfirmAsync(r, ct));
        teams.MapGet("/{id:guid}/billing", (Guid id, TeamBillingService s, CancellationToken ct) => s.BillingAsync(id, ct));
        teams.MapPost("/{id:guid}/seats/quote", (Guid id, TeamSeatQuoteRequest r, TeamBillingService s, CancellationToken ct) => s.SeatQuoteAsync(id, r, ct));
        teams.MapPost("/{id:guid}/seats/confirm", (Guid id, TeamPaymentConfirmRequest r, TeamBillingService s, CancellationToken ct) => s.SeatConfirmAsync(id, r, ct));
        teams.MapPost("/{id:guid}/renewal", (Guid id, TeamRenewalRequest r, TeamBillingService s, CancellationToken ct) => s.RenewalAsync(id, r, ct));
        teams.MapPost("/{id:guid}/renewal/quote", (Guid id, TeamBillingService s, CancellationToken ct) => s.RenewalQuoteAsync(id, ct));
        teams.MapGet("/{id:guid}/members", (Guid id, int? page, int? pageSize, TeamService s, CancellationToken ct) => s.MembersAsync(id, ct, page, pageSize));
        teams.MapPatch("/{id:guid}", (Guid id, TeamUpdateRequest r, TeamService s, CancellationToken ct) => s.UpdateAsync(id, r, ct));
        teams.MapPost("/{id:guid}/invitations/{requestId:guid}/revoke", async (Guid id, Guid requestId, TeamService s, CancellationToken ct) => { await s.RevokeAsync(id, requestId, ct); return Results.NoContent(); });
        teams.MapPatch("/{id:guid}/members/{userId:guid}/role", async (Guid id, Guid userId, TeamRoleRequest r, TeamService s, CancellationToken ct) => { await s.ChangeRoleAsync(id, userId, r, ct); return Results.NoContent(); });
        teams.MapDelete("/{id:guid}/members/{userId:guid}", async (Guid id, Guid userId, long version, TeamService s, CancellationToken ct) => { await s.RemoveAsync(id, userId, version, ct); return Results.NoContent(); });
        teams.MapPost("/{id:guid}/leave", async (Guid id, TeamVersionRequest r, TeamService s, Metrivum.Accounts.Contracts.IAccountContext account, CancellationToken ct) => { await s.RemoveAsync(id, account.UserId, r.Version, ct); return Results.NoContent(); });
        teams.MapPost("/{id:guid}/schedule-dissolution", (Guid id, TeamDissolutionRequest r, TeamService s, HttpContext http, CancellationToken ct) => s.ScheduleDissolutionAsync(id, r, http.User, ct));
        teams.MapPost("/{id:guid}/cancel-dissolution", (Guid id, TeamCancelDissolutionRequest r, TeamService s, CancellationToken ct) => s.CancelDissolutionAsync(id, r, ct));
        teams.MapPost("/{id:guid}/ownership-transfer", async (Guid id, TeamOwnershipRequest r, TeamService s, HttpContext http, CancellationToken ct) => { await s.RequestOwnershipAsync(id, r, http.User, ct); return Results.NoContent(); });
        teams.MapPost("/{id:guid}/ownership-transfer/accept", async (Guid id, TeamVersionRequest r, TeamService s, HttpContext http, CancellationToken ct) => { await s.AcceptOwnershipAsync(id, r.Version, http.User, ct); return Results.NoContent(); });
        me.MapGet("/team-context", (Metrivum.Accounts.Contracts.ITeamContext teams, Metrivum.Accounts.Contracts.IAccountContext account, CancellationToken ct) => teams.GetForUserAsync(account.UserId, ct));
        teams.MapGet("/", (string? search, TeamService s, CancellationToken ct) => s.SearchAsync(search, ct));
        teams.MapGet("/mine", (TeamService s, CancellationToken ct) => s.HomeAsync(ct));
        teams.MapPost("/{id:guid}/join", (Guid id, TeamService s, CancellationToken ct) => s.RequestAsync(id, null, ct));
        teams.MapPost("/{id:guid}/invitations", (Guid id, TeamInviteRequest r, TeamService s, CancellationToken ct) => s.RequestAsync(id, r, ct));
        teams.MapPost("/requests/{id:guid}/decision", (Guid id, TeamDecisionRequest r, TeamService s, CancellationToken ct) => s.DecideAsync(id, r.Accept, ct));
        var coach = endpoints.MapGroup("/api/v1/coaching").WithTags("Billing").RequireAuthorization();
        coach.MapGet("/relationships/{relationshipId:guid}/billing", (Guid relationshipId, int? page, int? pageSize, DueStatus? status, Guid? serviceId, DateTimeOffset? from, DateTimeOffset? to, string? sort, BillingService s, CancellationToken ct) => s.RelationshipAsync(relationshipId, page ?? 1, pageSize ?? 25, ct, status, serviceId, from, to, sort ?? "due"));
        coach.MapPost("/payment-dues/{id:guid}/mark-paid-externally", (Guid id, ExternalSettlementRequest r, BillingService s, CancellationToken ct) => s.ExternalAsync(id, r, ct));
        coach.MapGet("/earnings", (BillingService s, CancellationToken ct) => s.EarningsAsync(ct));
        return endpoints;
    }
}
