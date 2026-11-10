using Metrivum.Accounts.Contracts;

namespace Metrivum.Forms.Features;

/// <summary>A new coach gets the starter application form, published, as soon as onboarding finishes.</summary>
public sealed class StarterFormOnboarding(FormsService forms) : ICoachOnboardingObserver
{
    public Task CoachOnboardedAsync(CancellationToken ct) =>
        forms.EnsureStarterForNewCoachAsync(ct);
}
