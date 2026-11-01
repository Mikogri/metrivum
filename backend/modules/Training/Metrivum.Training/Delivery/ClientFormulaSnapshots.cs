using Microsoft.EntityFrameworkCore;
using Metrivum.BuildingBlocks;
using Metrivum.Coaching.Contracts;
using Metrivum.Training.Domain;
using Metrivum.Training.Features;
using Metrivum.Training.Infrastructure;
namespace Metrivum.Training.Delivery;

public sealed record AssignmentFormulaSnapshot(Dictionary<string, Quantity> Variables, Dictionary<string, string> SourceVersions, Dictionary<Guid, FormulaEvaluation> Evaluations, bool Stale);
public sealed record RefreshFormulaSnapshotRequest(Dictionary<string, string> SourceVersions);
public sealed partial class TrainingDeliveryService
{
    public async Task<AssignmentFormulaSnapshot> FormulaSnapshotAsync(Guid id, bool preview, CancellationToken ct)
    {
        var a = await AssignmentAsync(id, RelationshipOperation.Manage, ct);
        await ActiveRelationship(a, ct);
        if (formulaService == null) throw ApiException.Invalid("Client formulas are unavailable.");
        var revision = await db.Revisions.AsNoTracking().SingleAsync(x => x.Id == a.EffectiveRevisionId, ct);
        var current = await formulaService.ClientVariablesAsync(a.RelationshipId, ct);
        if (preview)
        {
            var resolved = await formulaService.ResolveClientFormulasAsync(revision.Snapshot.Document, a.ClientId, a.CoachId, ct, current);
            return new(resolved.Variables, resolved.SourceVersions, resolved.Evaluations, false);
        }
        var saved = a.FormulaSnapshot;
        var stale = saved == null ? DocumentRules.Prescriptions(revision.Snapshot.Document).SelectMany(PrescriptionFormulas.Uses).Any(FormulaBindings.NeedsClient) : saved.Evaluations.Values.SelectMany(x => x.SourceVersions ?? []).Any(x => current.SourceVersions.GetValueOrDefault(x.Key) != x.Value);
        return new(saved?.Variables ?? [], saved?.SourceVersions ?? [], saved?.Evaluations ?? revision.Snapshot.Formulas, stale);
    }
    public Task<AssignmentFormulaSnapshot> RefreshFormulaSnapshotAsync(Guid id, RefreshFormulaSnapshotRequest request, long version, CancellationToken ct) => MutateAsync<AssignmentFormulaSnapshot>(async () =>
    {
        var a = await AssignmentAsync(id, RelationshipOperation.Manage, ct);
        await ActiveRelationship(a, ct);
        DeliveryRules.Version(a.Version, version);
        if (a.Status is not (AssignmentStatus.Active or AssignmentStatus.Paused)) throw ApiException.Conflict("This assignment cannot be refreshed.");
        if (formulaService == null || request.SourceVersions == null) throw ApiException.Invalid("Formula preview is required.");
        var current = await formulaService.ClientVariablesAsync(a.RelationshipId, ct);
        if (request.SourceVersions.Count != current.SourceVersions.Count || current.SourceVersions.Any(x => request.SourceVersions.GetValueOrDefault(x.Key) != x.Value))
            throw ApiException.Conflict("Client variables changed. Preview the formula update again.");
        var revision = await db.Revisions.AsNoTracking().SingleAsync(x => x.Id == a.EffectiveRevisionId, ct);
        a.FormulaSnapshot = await formulaService.ResolveClientFormulasAsync(revision.Snapshot.Document, a.ClientId, a.CoachId, ct, current);
        var today = DeliveryRules.LocalDate(clock.GetUtcNow(), a.TimeZone);
        var unstarted = await Occurrences.Where(o => o.AssignmentId == id && !o.Superseded && o.ScheduledDate >= today && !Executions.Any(e => e.OccurrenceId == o.Id)).ToArrayAsync(ct);
        foreach (var o in unstarted)
        {
            var original = DocumentRules.Workouts(revision.Snapshot.Document).Single(w => w.Id == o.WorkoutId);
            o.Prescription = o.Prescription with { Workout = PrescriptionFormulas.Freeze(original, a.FormulaSnapshot.Evaluations), Formulas = a.FormulaSnapshot.Evaluations };
        }
        a.Version++; a.UpdatedAt = clock.GetUtcNow();
        await db.SaveChangesAsync(ct);
        return new(a.FormulaSnapshot.Variables, a.FormulaSnapshot.SourceVersions, a.FormulaSnapshot.Evaluations, false);
    }, ct);
}
