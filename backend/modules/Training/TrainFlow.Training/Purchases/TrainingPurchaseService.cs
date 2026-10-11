using Microsoft.EntityFrameworkCore;
using TrainFlow.Accounts.Contracts;
using TrainFlow.BuildingBlocks;
using TrainFlow.Training.Contracts;
using TrainFlow.Training.Domain;
using TrainFlow.Training.Features;
using TrainFlow.Training.Infrastructure;

namespace TrainFlow.Training.Purchases;

public sealed class TrainingPurchaseService(TrainingDbContext db, IAccountContext accounts, IAccountDirectory directory, ModuleTransaction transaction, TimeProvider clock) : ITrainingPurchases
{
    public async Task PrepareAsync(Guid orderId, Guid applicationId, Guid revisionId, Guid sellerId, Guid buyerId, Guid? teamId, CancellationToken ct)
    {
        if (!transaction.IsActive) throw new InvalidOperationException("Purchase preparation requires a billing transaction.");
        var actor = await accounts.RequireCoachAsync(ct);
        if (actor.UserId != sellerId || buyerId == sellerId) throw ApiException.NotFound();
        var revision = await (from r in db.Revisions.AsNoTracking() join p in db.Plans on r.PlanId equals p.Id
            where r.Id == revisionId && p.OwnerId == sellerId && p.WorkspaceId == actor.WorkspaceId && !p.Archived && p.Kind == DocumentKind.Program
            select r).SingleOrDefaultAsync(ct) ?? throw ApiException.NotFound();
        db.Add(new TrainingPurchase { OrderId = orderId, ApplicationId = applicationId, SellerId = sellerId, BuyerId = buyerId, TeamId = teamId,
            SourceRevisionId = revisionId, Name = revision.Snapshot.Name, Snapshot = TrainingJson.Serialize(revision.Snapshot), CreatedAt = clock.GetUtcNow() });
        await db.SaveChangesAsync(ct);
    }
    public async Task<Guid> FulfillAsync(Guid orderId, CancellationToken ct)
    {
        if (!transaction.IsActive) throw new InvalidOperationException("Delivery requires a settlement transaction.");
        var purchase = await db.Set<TrainingPurchase>().SingleOrDefaultAsync(x => x.OrderId == orderId, ct) ?? throw ApiException.NotFound();
        if (purchase.PlanId is { } delivered) return delivered;
        var buyer = (await directory.GetAccountsAsync([purchase.BuyerId], ct)).GetValueOrDefault(purchase.BuyerId) ?? throw ApiException.NotFound();
        var snapshot = TrainingJson.Deserialize<RevisionSnapshot>(purchase.Snapshot);
        // Convert seller-owned formulas into their accepted values; ownership never grants access to the source formula library.
        Prescription Freeze(Guid id, Prescription prescription) => snapshot.Formulas.TryGetValue(id, out var formula)
            ? prescription with { LoadFormula = null, Load = new(formula.Result, formula.Result), LoadPercent = null, BaseValue = null }
            : prescription with { LoadFormula = null };
        var document = snapshot.Document with { Blocks = snapshot.Document.Blocks.Select(b => b with { Cycles = b.Cycles.Select(c => c with {
            Days = c.Days.Select(d => d with { Workouts = d.Workouts.Select(w => w with { Exercises = w.Exercises.Select(e => e with {
                Sets = e.Sets.Select(s => s with { Prescription = Freeze(s.Id, s.Prescription), Segments = s.Segments?.Select(g => g with { Prescription = Freeze(g.Id, g.Prescription) }).ToArray() }).ToArray()
            }).ToArray() }).ToArray() }).ToArray() }).ToArray() }).ToArray() };
        var plan = new TrainingPlan { Id = Guid.NewGuid(), OwnerId = purchase.BuyerId, WorkspaceId = buyer.WorkspaceId, Name = snapshot.Name,
            Description = snapshot.Description, Kind = DocumentKind.Program, Draft = document, CreatedAt = clock.GetUtcNow(), UpdatedAt = clock.GetUtcNow() };
        db.Plans.Add(plan);
        db.Revisions.Add(new TrainingRevision { Id = Guid.NewGuid(), PlanId = plan.Id, Number = 1, DraftVersion = plan.Version, PublishedAt = clock.GetUtcNow(),
            IdempotencyKey = "purchase:" + orderId, RequestHash = orderId.ToString(), Snapshot = snapshot with { Document = document, Formulas = [] } });
        purchase.PlanId = plan.Id;
        purchase.DeliveredAt = clock.GetUtcNow();
        await db.SaveChangesAsync(ct);
        return plan.Id;
    }
    public async Task<Paged<PurchasedPlanDto>> ListAsync(int page, int pageSize, CancellationToken ct)
    {
        await accounts.RequireClientAsync(ct);
        if (page < 1 || pageSize is < 1 or > 100) throw ApiException.Invalid("Invalid pagination.");
        var query = db.Set<TrainingPurchase>().AsNoTracking().Where(x => x.BuyerId == accounts.UserId);
        var total = await query.LongCountAsync(ct);
        var rows = await query.OrderByDescending(x => x.CreatedAt).ThenBy(x => x.OrderId).Skip((page - 1) * pageSize).Take(pageSize)
            .Select(x => new PurchasedPlanDto(x.OrderId, x.ApplicationId, x.Name, x.PlanId, x.CreatedAt, x.DeliveredAt)).ToArrayAsync(ct);
        return new(rows, page, pageSize, total);
    }
}
