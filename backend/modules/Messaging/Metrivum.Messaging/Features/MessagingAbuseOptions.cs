namespace Metrivum.Messaging.Features;

/// <summary>Contains the configured messaging abuse settings and bounds for Messaging; does not itself access the database.</summary>
public sealed class MessagingAbuseOptions
{
    public int StrangerContactsPerHour { get; set; } = 5;
    public int UnestablishedContactsPerDay { get; set; } = 3;
    public int GroupsPerDay { get; set; } = 20;
    public int MaximumRecipients { get; set; } = 100;
}
