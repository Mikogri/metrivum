namespace TrainFlow.Messaging.Features;

public sealed class MessagingAbuseOptions
{
    public int StrangerContactsPerHour { get; set; } = 5;
    public int UnestablishedContactsPerDay { get; set; } = 3;
    public int GroupsPerDay { get; set; } = 20;
    public int MaximumRecipients { get; set; } = 100;
}
