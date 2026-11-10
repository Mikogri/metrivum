using Metrivum.Accounts.Contracts;
using Metrivum.BuildingBlocks;
using Metrivum.Training.Contracts;
using Metrivum.Training.Domain;
using Metrivum.Training.Features;
using Metrivum.Training.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace Metrivum.Training.Purchases;

/// <summary>Creates and delivers authorized frozen copies of purchased training plans in the Training database.</summary>
public sealed class TrainingPurchaseService(
    TrainingDbContext db,
    IAccountContext accounts,
    IAccountDirectory directory,
    ModuleTransaction transaction,
    TimeProvider clock
) : ITrainingPurchases
{
    public async Task PrepareAsync(
        Guid orderId,
        Guid applicationId,
        Guid revisionId,
        Guid sellerId,
        Guid buyerId,
        Guid? teamId,
        CancellationToken ct
    )
    {
        if (!transaction.IsActive)
            throw new InvalidOperationException(
                "Purchase preparation requires a billing transaction."
            );
        var actor = await accounts.RequireCoachAsync(ct);
        if (actor.UserId != sellerId || buyerId == sellerId)
            throw ApiException.NotFound();
        var revision =
            await (
                from r in db.Revisions.AsNoTracking()
                join p in db.Plans on r.PlanId equals p.Id
                where
                    r.Id == revisionId
                    && p.OwnerId == sellerId
                    && p.WorkspaceId == actor.WorkspaceId
                    && !p.Archived
                    && p.Kind == DocumentKind.Program
                select r
            ).SingleOrDefaultAsync(ct) ?? throw ApiException.NotFound();
        db.Add(
            new TrainingPurchase
            {
                OrderId = orderId,
                ApplicationId = applicationId,
                SellerId = sellerId,
                BuyerId = buyerId,
                TeamId = teamId,
                SourceRevisionId = revisionId,
                Name = revision.Snapshot.Name,
                Snapshot = TrainingJson.Serialize(revision.Snapshot),
                CreatedAt = clock.GetUtcNow(),
            }
        );
        await db.SaveChangesAsync(ct);
    }

    public async Task<Guid> FulfillAsync(Guid orderId, CancellationToken ct)
    {
        if (!transaction.IsActive)
            throw new InvalidOperationException("Delivery requires a settlement transaction.");
        var purchase =
            await db.Set<TrainingPurchase>().SingleOrDefaultAsync(x => x.OrderId == orderId, ct)
            ?? throw ApiException.NotFound();
        if (purchase.PlanId is { } delivered)
            return delivered;
        var buyer =
            (await directory.GetAccountsAsync([purchase.BuyerId], ct)).GetValueOrDefault(
                purchase.BuyerId
            ) ?? throw ApiException.NotFound();
        var snapshot = TrainingJson.Deserialize<RevisionSnapshot>(purchase.Snapshot);
        // Convert seller-owned formulas into their accepted values; ownership never grants access to the source formula library.
        var publicDocument = DocumentRules.ForClient(snapshot.Document);
        // Max-table formulas belong to the seller; the delivered workouts already contain frozen loads.
        var document = publicDocument with
        {
            MaxesTables = publicDocument
                .MaxesTables?.Select(t =>
                    t with
                    {
                        Rows = t
                            .Rows.Where(r => r.LoadFormula == null && r.TimeFormula == null)
                            .ToArray(),
                    }
                )
                .ToArray(),
            Blocks = publicDocument
                .Blocks.Select(b =>
                    b with
                    {
                        ExerciseMaxes = b
                            .ExerciseMaxes?.Where(r =>
                                r.LoadFormula == null && r.TimeFormula == null
                            )
                            .ToArray(),
                        Cycles = b
                            .Cycles.Select(c =>
                                c with
                                {
                                    Days = c
                                        .Days.Select(d =>
                                            d with
                                            {
                                                Workouts = d
                                                    .Workouts.Select(w =>
                                                        PrescriptionFormulas.Freeze(
                                                            w,
                                                            snapshot.Formulas
                                                        )
                                                    )
                                                    .ToArray(),
                                            }
                                        )
                                        .ToArray(),
                                }
                            )
                            .ToArray(),
                    }
                )
                .ToArray(),
        };
        var plan = new TrainingPlan
        {
            Id = Guid.NewGuid(),
            OwnerId = purchase.BuyerId,
            WorkspaceId = buyer.WorkspaceId,
            Name = snapshot.Name,
            Description = snapshot.Description,
            Kind = DocumentKind.Program,
            Draft = document,
            CreatedAt = clock.GetUtcNow(),
            UpdatedAt = clock.GetUtcNow(),
        };
        db.Plans.Add(plan);
        db.Revisions.Add(
            new TrainingRevision
            {
                Id = Guid.NewGuid(),
                PlanId = plan.Id,
                Number = 1,
                DraftVersion = plan.Version,
                PublishedAt = clock.GetUtcNow(),
                IdempotencyKey = "purchase:" + orderId,
                RequestHash = orderId.ToString(),
                Snapshot = snapshot with { Document = document, Formulas = [] },
            }
        );
        purchase.PlanId = plan.Id;
        purchase.DeliveredAt = clock.GetUtcNow();
        await db.SaveChangesAsync(ct);
        return plan.Id;
    }

    public async Task<Paged<PurchasedPlanDto>> ListAsync(
        int page,
        int pageSize,
        CancellationToken ct
    )
    {
        await accounts.RequireClientAsync(ct);
        if (page < 1 || pageSize is < 1 or > 100)
            throw ApiException.Invalid("Invalid pagination.");
        var query = db.Set<TrainingPurchase>()
            .AsNoTracking()
            .Where(x => x.BuyerId == accounts.UserId);
        var total = await query.LongCountAsync(ct);
        var rows = await query
            .OrderByDescending(x => x.CreatedAt)
            .ThenBy(x => x.OrderId)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(x => new PurchasedPlanDto(
                x.OrderId,
                x.ApplicationId,
                x.Name,
                x.PlanId,
                x.CreatedAt,
                x.DeliveredAt
            ))
            .ToArrayAsync(ct);
        return new(rows, page, pageSize, total);
    }
}
