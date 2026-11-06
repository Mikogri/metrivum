namespace Metrivum.Access.Infrastructure;

public sealed class AbuseWindow
{
    public Guid UserId { get; set; }
    public string Policy { get; set; } = "";
    public DateTimeOffset WindowStart { get; set; }
    public int Count { get; set; }
}
