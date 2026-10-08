using Microsoft.EntityFrameworkCore;
using TrainFlow.Billing.Domain;
using TrainFlow.Notifications.Contracts;

namespace TrainFlow.Billing.Infrastructure;

public sealed class BillingNotificationPolicy(BillingDbContext db) : INotificationDeliveryPolicy
{
    public string SourceModule => "Billing";
    public async Task<bool> CanDeliverAsync(NotificationEvent notification, CancellationToken ct)
    {
        if (notification.Type is not ("PaymentDueSoon" or "PaymentOverdue"))
            return true;
        var due = await db.Dues.AsNoTracking().SingleOrDefaultAsync(x => x.Id == notification.SourceId && x.ClientId == notification.RecipientUserId, ct);
        if (due is not { Status: DueStatus.AwaitingPayment })
            return false;
        return due.Context != BillingContext.Platform || await db.PlatformSubscriptions.AsNoTracking()
            .AnyAsync(x => x.OwnerId == due.ClientId && x.PendingDueId == due.Id, ct);
    }
}
