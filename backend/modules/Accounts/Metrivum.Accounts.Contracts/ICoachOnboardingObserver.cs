namespace Metrivum.Accounts.Contracts;

/// <summary>
/// Told when the signed-in account has just become a coach (onboarding as a coach, or adding the coach role), so
/// other modules can set up what a new coach starts with. It runs as that account, after the role is saved; a
/// failure is logged and never undoes the onboarding.
/// </summary>
public interface ICoachOnboardingObserver
{
    Task CoachOnboardedAsync(CancellationToken ct);
}
