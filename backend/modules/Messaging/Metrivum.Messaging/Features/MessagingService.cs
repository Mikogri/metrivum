using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Metrivum.Access.Contracts;
using Metrivum.Accounts.Contracts;
using Metrivum.BuildingBlocks;
using Metrivum.Coaching.Contracts;
using Metrivum.Media.Contracts;
using Metrivum.Messaging.Domain;
using Metrivum.Messaging.Infrastructure;
using Metrivum.Notifications.Contracts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace Metrivum.Messaging.Features;

/// <summary>Reads and changes authorized conversations, messages, requests and moderation state in the Messaging database.</summary>
public sealed partial class MessagingService(
    MessagingDbContext db,
    IAccountContext accounts,
    IAccountDirectory directory,
    IFeatureAccessService access,
    ICoachingMessagingDirectory coaching,
    IMediaLibrary media,
    ModuleTransaction tx,
    TimeProvider clock,
    IOptions<MessagingOptions> options,
    MessagingDispatcher dispatcher,
    INotificationPublisher notifications,
    IFeatureAudience audience,
    INotificationReadStore notificationReads,
    IAbuseProtection? abuse = null,
    IOptions<MessagingAbuseOptions>? abuseOptions = null
) : ICoachingMessagingObserver, ICoachingChatPublisher, IMessagingUploadAuthorization
{
    private Guid Actor => accounts.UserId;
    private readonly MessagingAbuseOptions abuseLimits = abuseOptions?.Value ?? new();

    public async Task<AccountSearchEntry[]> SearchPeopleAsync(string search, CancellationToken ct)
    {
        await Feature("messaging.direct", ct);
        var people = await directory.SearchAsync(search, ct);
        var blocked = await db
            .Blocks.AsNoTracking()
            .Where(x => x.UserId == Actor || x.BlockedUserId == Actor)
            .Select(x => x.UserId == Actor ? x.BlockedUserId : x.UserId)
            .ToArrayAsync(ct);
        return people.Where(x => x.UserId != Actor && !blocked.Contains(x.UserId)).ToArray();
    }

    public async Task<RequestDto> RequestByUsernameAsync(
        UsernameContactRequest request,
        CancellationToken ct
    )
    {
        await Feature("messaging.direct", ct);
        var recipient =
            await directory.ResolveExactUsernameAsync(request.Username, ct)
            ?? throw ApiException.NotFound();
        return await RequestAsync(new(recipient.UserId, request.Body), ct);
    }

    private async Task Feature(string key, CancellationToken ct)
    {
        if (Actor == Guid.Empty)
            throw new ApiException(401, "AUTHENTICATION_REQUIRED", "Sign in first.");
        if ((await accounts.GetRolesAsync(ct)).Count == 0)
            throw new ApiException(403, "ONBOARDING_REQUIRED", "Complete onboarding.");
        await access.RequireAsync(key, ct);
    }

    private Task Lock(string key, CancellationToken ct) =>
        db.Database.ExecuteSqlInterpolatedAsync(
            $"SELECT pg_advisory_xact_lock(hashtextextended({key}, 0))",
            ct
        );

    private Task PairLock(Guid a, Guid b, CancellationToken ct)
    {
        var p = MessagingRules.Pair(a, b);
        return Lock("messaging-pair:" + p.First + ":" + p.Second, ct);
    }

    private async Task<Conversation> Conversation(Guid id, CancellationToken ct) =>
        await db.Conversations.SingleOrDefaultAsync(x => x.Id == id, ct)
        ?? throw ApiException.NotFound();

    private async Task<ConversationMember> Member(Guid id, bool active, CancellationToken ct)
    {
        var membership =
            await (
                from member in db.Members.AsNoTracking()
                join c in db.Conversations.AsNoTracking() on member.ConversationId equals c.Id
                where member.ConversationId == id && member.UserId == Actor
                select new { Member = member, c.Type }
            ).SingleOrDefaultAsync(ct) ?? throw ApiException.NotFound();
        var m = membership.Member;
        await Feature(
            membership.Type == ConversationType.Direct ? "messaging.direct" : "messaging.groups",
            ct
        );
        if (active && m.State != MemberState.Active)
            throw new ApiException(403, "MEMBERSHIP_INACTIVE", "Active membership is required.");
        return m;
    }

    private async Task<ConversationMember> Manage(Guid id, CancellationToken ct)
    {
        await Feature("messaging.group.manage", ct);
        var c = await Conversation(id, ct);
        if (c.Type == ConversationType.Direct)
            throw ApiException.Invalid("Direct membership cannot be managed.");
        var m = await Member(id, true, ct);
        if (m.Role is not (MemberRole.Owner or MemberRole.Admin))
            throw new ApiException(403, "GROUP_ADMIN_REQUIRED", "Group administrator required.");
        return m;
    }

    private Task<bool> Blocked(Guid a, Guid b, CancellationToken ct) =>
        db.Blocks.AnyAsync(
            x => (x.UserId == a && x.BlockedUserId == b) || (x.UserId == b && x.BlockedUserId == a),
            ct
        );

    private async Task NotBlocked(Guid a, Guid b, CancellationToken ct)
    {
        if (await Blocked(a, b, ct))
            throw new ApiException(403, "USER_BLOCKED", "Direct communication is unavailable.");
    }

    private async Task Known(Guid[] ids, CancellationToken ct)
    {
        if (
            ids.Contains(Guid.Empty)
            || (await directory.GetAccountsAsync(ids, ct)).Count != ids.Distinct().Count()
        )
            throw ApiException.Invalid("All members must be onboarded accounts.");
    }

    public async Task<ConversationDto> DirectAsync(Guid other, CancellationToken ct)
    {
        await Feature("messaging.direct", ct);
        MessagingRules.Pair(Actor, other);
        await Known([Actor, other], ct);
        var id = await tx.RunAsync(
            async token =>
            {
                await PairLock(Actor, other, token);
                await NotBlocked(Actor, other, token);
                var p = MessagingRules.Pair(Actor, other);
                var existing = await db.Conversations.SingleOrDefaultAsync(
                    x => x.PairFirst == p.First && x.PairSecond == p.Second,
                    token
                );
                if (existing != null)
                    return existing.Id;
                if (await RequiresApprovalAsync(other, token))
                    throw new ApiException(
                        403,
                        "MESSAGE_REQUEST_REQUIRED",
                        "Send a message request first."
                    );
                return (await CreateDirect(Actor, other, token)).Id;
            },
            ct
        );
        return await GetAsync(id, ct);
    }

    private async Task<Conversation> CreateDirect(Guid a, Guid b, CancellationToken ct)
    {
        var p = MessagingRules.Pair(a, b);
        var c = await db.Conversations.SingleOrDefaultAsync(
            x => x.PairFirst == p.First && x.PairSecond == p.Second,
            ct
        );
        if (c != null)
            return c;
        c = new()
        {
            Type = ConversationType.Direct,
            PairFirst = p.First,
            PairSecond = p.Second,
            CreatedAt = clock.GetUtcNow(),
            UpdatedAt = clock.GetUtcNow(),
        };
        db.Conversations.Add(c);
        foreach (var user in new[] { a, b })
            db.Members.Add(
                new()
                {
                    ConversationId = c.Id,
                    UserId = user,
                    Source = MemberSource.Direct,
                    Role = MemberRole.Member,
                    JoinedAt = c.CreatedAt,
                }
            );
        await db.SaveChangesAsync(ct);
        return c;
    }

    public async Task<ConversationDto> GroupAsync(GroupRequest request, CancellationToken ct)
    {
        await Feature("messaging.groups", ct);
        await Feature("messaging.group.manage", ct);
        MessagingRules.Text(request.Title, 200, true);
        var ids = (request.UserIds ?? []).Append(Actor).Distinct().ToArray();
        if (ids.Length > Math.Min(101, options.Value.MaxGroupMembers))
            throw ApiException.Invalid("Too many group members.");
        await Known(ids, ct);
        var id = await tx.RunAsync(
            async token =>
            {
                await AdmitRecipientsAsync(ids, true, token);
                var c = new Conversation
                {
                    Type = ConversationType.Group,
                    Title = request.Title.Trim(),
                    CreatedAt = clock.GetUtcNow(),
                    UpdatedAt = clock.GetUtcNow(),
                };
                db.Conversations.Add(c);
                foreach (var user in ids)
                    db.Members.Add(
                        new()
                        {
                            ConversationId = c.Id,
                            UserId = user,
                            Source = MemberSource.Manual,
                            Role = user == Actor ? MemberRole.Owner : MemberRole.Member,
                            JoinedAt = c.CreatedAt,
                        }
                    );
                await db.SaveChangesAsync(token);
                return c.Id;
            },
            ct
        );
        return await GetAsync(id, ct);
    }

    public async Task<ConversationDto> LinkAsync(Guid groupId, bool create, CancellationToken ct)
    {
        await Feature("messaging.groups", ct);
        await Feature("messaging.group.manage", ct);
        var id = await tx.RunAsync(
            async token =>
            {
                await Lock("coaching-messaging", token);
                var group = await coaching.OwnedGroupAsync(groupId, token);
                var c = await db.Conversations.SingleOrDefaultAsync(
                    x => x.ClientGroupId == groupId,
                    token
                );
                if (c == null)
                {
                    if (!create)
                        throw ApiException.NotFound();
                    if (group.Archived)
                        throw ApiException.Conflict("Restore the client group first.");
                    await AdmitRecipientsAsync(group.EligibleUserIds, true, token);
                    c = new()
                    {
                        Type = ConversationType.ClientGroupLinked,
                        ClientGroupId = groupId,
                        Title = group.Title,
                        CreatedAt = clock.GetUtcNow(),
                        UpdatedAt = clock.GetUtcNow(),
                    };
                    db.Conversations.Add(c);
                    db.Members.Add(
                        new()
                        {
                            ConversationId = c.Id,
                            UserId = Actor,
                            Source = MemberSource.Manual,
                            Role = MemberRole.Owner,
                            JoinedAt = c.CreatedAt,
                        }
                    );
                    await db.SaveChangesAsync(token);
                }

                await GroupChangedAsync(group, token);
                return c.Id;
            },
            ct
        );
        return await GetAsync(id, ct);
    }

    public async Task GroupChangedAsync(MessagingClientGroup group, CancellationToken ct)
    {
        var c = await db.Conversations.SingleOrDefaultAsync(x => x.ClientGroupId == group.Id, ct);
        if (c == null)
            return;
        await Lock("messaging-conversation:" + c.Id, ct);
        await db.Entry(c).ReloadAsync(ct);
        var members = await db.Members.Where(x => x.ConversationId == c.Id).ToArrayAsync(ct);
        var eligible = group.Archived ? [] : group.EligibleUserIds.Distinct().ToArray();
        if (
            eligible.Count(user =>
                user != group.CoachId
                && !members.Any(m => m.UserId == user && m.State == MemberState.Active)
            ) > abuseLimits.MaximumRecipients
        )
            throw ApiException.Invalid("Too many unique group recipients in one operation.");
        foreach (var m in members.Where(x => x.Source == MemberSource.ClientGroupSync))
        {
            if (!eligible.Contains(m.UserId) && m.State == MemberState.Active)
                Transition(c, m, MemberState.Removed, false, group.CoachId);
            else if (eligible.Contains(m.UserId) && m.State != MemberState.Active && !m.Excluded)
                Transition(c, m, MemberState.Active, false, group.CoachId);
        }

        foreach (var user in eligible.Where(x => members.All(m => m.UserId != x)))
        {
            var m = new ConversationMember
            {
                ConversationId = c.Id,
                UserId = user,
                Source = MemberSource.ClientGroupSync,
                Role = MemberRole.Member,
            };
            db.Members.Add(m);
            Transition(c, m, MemberState.Active, false, group.CoachId);
        }

        await db.SaveChangesAsync(ct);
        tx.OnCommitted(token =>
            dispatcher.ConversationAsync(
                c.Id,
                "MembershipChanged",
                new { ConversationId = c.Id },
                token
            )
        );
    }

    private void Transition(
        Conversation c,
        ConversationMember m,
        MemberState state,
        bool excluded,
        Guid actor
    )
    {
        var wasActive = m.State == MemberState.Active;
        m.State = state;
        m.Excluded = excluded;
        m.RemovedAt =
            state == MemberState.Active ? null
            : wasActive ? clock.GetUtcNow()
            : m.RemovedAt;
        m.CutoffSequence =
            state == MemberState.Active ? null
            : wasActive ? c.Sequence
            : m.CutoffSequence;
        if (state == MemberState.Active)
            m.JoinedAt = clock.GetUtcNow();
        db.MembershipChanges.Add(
            new()
            {
                ConversationId = c.Id,
                UserId = m.UserId,
                ActorId = actor,
                State = state,
                Source = m.Source,
                OccurredAt = clock.GetUtcNow(),
                BoundarySequence = m.CutoffSequence ?? c.Sequence,
            }
        );
    }

    public async Task MemberAsync(Guid id, Guid user, string operation, CancellationToken ct)
    {
        if (operation is not ("add" or "remove" or "ban" or "unban"))
            throw ApiException.Invalid("Unknown membership operation.");
        await Known([user], ct);
        await tx.RunAsync(
            async token =>
            {
                await Lock("coaching-messaging", token);
                await Lock("messaging-conversation:" + id, token);
                var admin = await Manage(id, token);
                var c = await Conversation(id, token);
                var m = await db.Members.SingleOrDefaultAsync(
                    x => x.ConversationId == id && x.UserId == user,
                    token
                );
                if (m?.Role == MemberRole.Owner)
                    throw ApiException.Conflict("Owner cannot be removed.");
                if (m?.Role == MemberRole.Admin && admin.Role != MemberRole.Owner)
                    throw new ApiException(403, "OWNER_REQUIRED", "Owner required.");
                if (operation == "add")
                {
                    await AdmitRecipientsAsync([user], false, token);
                    if (m?.Excluded == true)
                        throw ApiException.Conflict("Remove the explicit exclusion first.");
                    if (
                        m?.State != MemberState.Active
                        && await db.Members.CountAsync(
                            x => x.ConversationId == id && x.State == MemberState.Active,
                            token
                        ) >= options.Value.MaxGroupMembers
                    )
                        throw ApiException.Conflict("Group is full.");
                    if (m == null)
                    {
                        m = new()
                        {
                            ConversationId = id,
                            UserId = user,
                            Role = MemberRole.Member,
                            Source = MemberSource.Manual,
                        };
                        db.Members.Add(m);
                    }

                    m.Source = MemberSource.Manual;
                    Transition(c, m, MemberState.Active, false, Actor);
                }
                else
                {
                    if (m == null)
                        throw ApiException.NotFound();
                    if (operation == "unban")
                    {
                        m.Excluded = false;
                        if (m.State == MemberState.Banned)
                            m.State = MemberState.Removed;
                        db.MembershipChanges.Add(
                            new()
                            {
                                ConversationId = id,
                                UserId = user,
                                ActorId = Actor,
                                State = m.State,
                                Source = m.Source,
                                OccurredAt = clock.GetUtcNow(),
                                BoundarySequence = m.CutoffSequence ?? c.Sequence,
                            }
                        );
                    }
                    else
                        Transition(
                            c,
                            m,
                            operation == "ban" ? MemberState.Banned : MemberState.Removed,
                            true,
                            Actor
                        );
                }

                await db.SaveChangesAsync(token);
                if (
                    operation == "unban"
                    && m?.Source == MemberSource.ClientGroupSync
                    && c.ClientGroupId.HasValue
                )
                    await GroupChangedAsync(
                        await coaching.OwnedGroupAsync(c.ClientGroupId.Value, token),
                        token
                    );
            },
            ct
        );
        await dispatcher.ConversationAsync(
            id,
            "MembershipChanged",
            new { ConversationId = id, UserId = user },
            ct
        );
    }

    public async Task RenameAsync(Guid id, string title, CancellationToken ct)
    {
        MessagingRules.Text(title, 200, true);
        await tx.RunAsync(
            async token =>
            {
                await Lock("messaging-conversation:" + id, token);
                await Manage(id, token);
                var c = await Conversation(id, token);
                c.Title = title.Trim();
                var now = clock.GetUtcNow();
                if (now > c.UpdatedAt)
                    c.UpdatedAt = now;
                await db.SaveChangesAsync(token);
            },
            ct
        );
        await dispatcher.ConversationAsync(
            id,
            "ConversationUpdated",
            new { ConversationId = id },
            ct
        );
    }

    public async Task<MessageDto> SendAsync(
        Guid id,
        SendMessageRequest request,
        string key,
        CancellationToken ct
    )
    {
        MessagingRules.Text(key, 100, true);
        MessagingRules.Text(request.Body, 8000);
        if (!Enum.IsDefined(request.Type) || request.Type == MessageType.System)
            throw ApiException.Invalid("Invalid message type.");
        var mediaIds = request.MediaIds ?? [];
        if (
            mediaIds.Length > options.Value.MaxAttachments
            || mediaIds.Distinct().Count() != mediaIds.Length
        )
            throw ApiException.Invalid("Invalid attachment count.");
        if (
            request.Type == MessageType.Text
            && (mediaIds.Length != 0 || string.IsNullOrWhiteSpace(request.Body))
        )
            throw ApiException.Invalid("Text messages require body and no attachments.");
        if (request.Type != MessageType.Text && mediaIds.Length == 0)
            throw ApiException.Invalid("Attachment messages require media.");
        if (mediaIds.Length > 0)
            await Feature("messaging.attachments", ct);
        if (request.Type == MessageType.VoiceMessage)
        {
            await Feature("messaging.voice", ct);
            if (mediaIds.Length != 1)
                throw ApiException.Invalid("Voice requires one audio attachment.");
        }

        var hash = Convert.ToHexString(
            SHA256.HashData(Encoding.UTF8.GetBytes(JsonSerializer.Serialize(request)))
        );
        var result = await tx.RunAsync(
            async token =>
            {
                var c = await Conversation(id, token);
                if (c.Type == ConversationType.Direct)
                    await PairLock(c.PairFirst!.Value, c.PairSecond!.Value, token);
                await Lock("messaging-conversation:" + id, token);
                await db.Entry(c).ReloadAsync(token);
                var member = await Member(id, true, token);
                if (c.Type != ConversationType.Direct)
                    await Feature("messaging.groups", token);
                else
                    await NotBlocked(c.PairFirst!.Value, c.PairSecond!.Value, token);
                var existing = await db.Messages.SingleOrDefaultAsync(
                    x =>
                        x.ConversationId == id
                        && x.SenderUserId == Actor
                        && x.IdempotencyKey == key,
                    token
                );
                if (existing != null)
                {
                    if (existing.RequestHash != hash)
                        throw ApiException.Conflict(
                            "Idempotency key was used for another message."
                        );
                    return (existing, false);
                }

                await RequireConversationConsentAsync(c, token);
                if (abuse is not null)
                    await abuse.RequireAsync(
                        Actor,
                        AbusePolicies.Message,
                        cancellationToken: token
                    );
                if (c.Type == ConversationType.Direct)
                    await AdmitDirectContactAsync(c, token);

                var firstMessageRequiresApproval = await RequiresFirstMessageApprovalAsync(
                    c,
                    token
                );
                if (
                    firstMessageRequiresApproval
                    && (request.Type != MessageType.Text || request.ReplyToMessageId.HasValue)
                )
                    throw new ApiException(
                        403,
                        "MESSAGE_REQUEST_REQUIRED",
                        "Send a text introduction and wait for approval before sending replies or attachments."
                    );

                if (
                    request.ReplyToMessageId.HasValue
                    && !await db.Messages.AnyAsync(
                        x =>
                            x.Id == request.ReplyToMessageId
                            && x.ConversationId == id
                            && (
                                !member.CutoffSequence.HasValue
                                || x.Sequence <= member.CutoffSequence
                            ),
                        token
                    )
                )
                    throw ApiException.Invalid(
                        "Reply must reference a visible message in this conversation."
                    );
                var ready = new List<ReadyMedia>();
                foreach (var mediaId in mediaIds)
                {
                    var file = await media.RequireReadyAsync(mediaId, Actor, token);
                    ValidateMedia(request.Type, file);
                    await media.PinAsync(mediaId, Actor, token);
                    ready.Add(file);
                }

                var instant = clock.GetUtcNow();
                var now = new DateTimeOffset(instant.Ticks - instant.Ticks % 10, TimeSpan.Zero);
                if (now <= c.UpdatedAt)
                    now = c.UpdatedAt.AddTicks(10);
                c.Sequence++;
                c.UpdatedAt = now;
                var msg = new Message
                {
                    ConversationId = id,
                    SenderUserId = Actor,
                    Type = request.Type,
                    Body = request.Body,
                    ReplyToMessageId = request.ReplyToMessageId,
                    CreatedAt = now,
                    Sequence = c.Sequence,
                    IdempotencyKey = key,
                    RequestHash = hash,
                };
                db.Messages.Add(msg);
                if (firstMessageRequiresApproval)
                    db.Requests.Add(
                        new MessageRequest
                        {
                            SenderUserId = Actor,
                            RecipientUserId =
                                c.PairFirst == Actor ? c.PairSecond!.Value : c.PairFirst!.Value,
                            PairFirst = c.PairFirst!.Value,
                            PairSecond = c.PairSecond!.Value,
                            Body = request.Body!,
                            ConversationId = c.Id,
                            IntroductionMessageId = msg.Id,
                            CreatedAt = now,
                            UpdatedAt = now,
                        }
                    );
                foreach (var file in ready)
                    db.Attachments.Add(
                        new()
                        {
                            MessageId = msg.Id,
                            MediaId = file.Id,
                            OwnerId = Actor,
                            ContentType = file.ContentType,
                            Size = file.Size,
                            DurationMs = file.DurationMs,
                        }
                    );
                await db.SaveChangesAsync(token);
                var recipients = await db
                    .Members.AsNoTracking()
                    .Where(x =>
                        x.ConversationId == id && x.State == MemberState.Active && x.UserId != Actor
                    )
                    .Select(x => x.UserId)
                    .ToArrayAsync(token);
                var permitted = await audience.GetAllowedUsersAsync(
                    recipients,
                    c.Type == ConversationType.Direct ? "messaging.direct" : "messaging.groups",
                    token
                );
                foreach (var recipient in recipients.Where(permitted.Contains))
                    await notifications.PublishAsync(
                        new(
                            recipient,
                            "message:" + msg.Id,
                            "MessageCreated",
                            "Messaging",
                            "Messaging",
                            id,
                            "/app/messages?conversation=" + id
                        ),
                        token
                    );
                return (msg, true);
            },
            ct
        );
        var dto = (await Dtos([result.Item1], ct))[0];
        if (result.Item2)
        {
            if (tx.IsActive)
                tx.OnCommitted(token =>
                    dispatcher.ConversationAsync(id, "MessageCreated", dto, token)
                );
            else
                await dispatcher.ConversationAsync(id, "MessageCreated", dto, ct);
        }
        return dto;
    }

    public async Task<MessageDto> DeleteAsync(Guid id, CancellationToken ct)
    {
        var result = await tx.RunAsync(
            async token =>
            {
                var message =
                    await db.Messages.SingleOrDefaultAsync(
                        x => x.Id == id && x.SenderUserId == Actor,
                        token
                    ) ?? throw ApiException.NotFound();
                await Lock("messaging-conversation:" + message.ConversationId, token);
                await db.Entry(message).ReloadAsync(token);
                var member = await Member(message.ConversationId, false, token);
                if (
                    message.Type == MessageType.System
                    || (member.CutoffSequence.HasValue && message.Sequence > member.CutoffSequence)
                )
                    throw ApiException.NotFound();
                var instant = clock.GetUtcNow();
                message.DeletedAt ??= new DateTimeOffset(
                    instant.Ticks - instant.Ticks % 10,
                    TimeSpan.Zero
                );
                message.Body = null;
                message.ReplyToMessageId = null;
                await db.SaveChangesAsync(token);
                return message;
            },
            ct
        );
        var dto = (await Dtos([result], ct))[0];
        await dispatcher.ConversationAsync(result.ConversationId, "MessageDeleted", dto, ct);
        return dto;
    }

    private void ValidateMedia(MessageType type, ReadyMedia file)
    {
        if (file.Size <= 0 || file.Size > options.Value.MaxAttachmentBytes)
            throw ApiException.Invalid("Attachment exceeds size limit.");
        var allowed = type switch
        {
            MessageType.Image => file.ContentType.StartsWith("image/", StringComparison.Ordinal),
            MessageType.Video => file.ContentType.StartsWith("video/", StringComparison.Ordinal),
            MessageType.VoiceMessage => file.ContentType == "audio/wav"
                && file.DurationMs is > 0
                && file.DurationMs <= options.Value.MaxVoiceDurationMs,
            MessageType.File => true,
            _ => false,
        };
        if (!allowed)
            throw ApiException.Invalid("Media type or verified voice duration is invalid.");
    }

    private IQueryable<Message> Visible(Guid id) =>
        db
            .Messages.AsNoTracking()
            .Where(x =>
                x.ConversationId == id
                && db.Members.Any(m =>
                    m.ConversationId == id
                    && m.UserId == Actor
                    && (!m.CutoffSequence.HasValue || x.Sequence <= m.CutoffSequence)
                )
            );

    public async Task<MessagePage> HistoryAsync(
        Guid id,
        string? before,
        string? after,
        int limit,
        CancellationToken ct
    )
    {
        var m = await Member(id, false, ct);
        if (limit is < 1 or > 100 || before != null && after != null)
            throw ApiException.Invalid("Use one cursor and a limit from 1 to 100.");
        var q = Visible(id);
        if (before != null)
        {
            var cur = MessageCursor.Decode(before, id);
            q = q.Where(x =>
                x.CreatedAt < cur.CreatedAt
                || (x.CreatedAt == cur.CreatedAt && x.Id.CompareTo(cur.Id) < 0)
            );
        }

        if (after != null)
        {
            var cur = MessageCursor.Decode(after, id);
            q = q.Where(x =>
                x.CreatedAt > cur.CreatedAt
                || (x.CreatedAt == cur.CreatedAt && x.Id.CompareTo(cur.Id) > 0)
            );
        }

        var rows =
            after == null
                ? await q.OrderByDescending(x => x.CreatedAt)
                    .ThenByDescending(x => x.Id)
                    .Take(limit)
                    .ToArrayAsync(ct)
                : await q.OrderBy(x => x.CreatedAt).ThenBy(x => x.Id).Take(limit).ToArrayAsync(ct);
        var dtos = await Dtos(rows, ct);
        return new(
            dtos,
            dtos.Length == 0 ? null : dtos.MinBy(x => (x.CreatedAt, x.Id))!.Cursor,
            dtos.Length == 0 ? null : dtos.MaxBy(x => (x.CreatedAt, x.Id))!.Cursor
        );
    }

    private async Task<MessageDto[]> Dtos(Message[] messages, CancellationToken ct)
    {
        if (messages.Length == 0)
            return [];
        var ids = messages.Select(x => x.Id).ToArray();
        var attachments = await db
            .Attachments.AsNoTracking()
            .Where(x => ids.Contains(x.MessageId))
            .ToArrayAsync(ct);
        return messages
            .Select(x => new MessageDto(
                x.Id,
                x.ConversationId,
                x.SenderUserId,
                x.Type,
                x.Body,
                x.ReplyToMessageId,
                x.CreatedAt,
                new MessageCursor(x.ConversationId, x.CreatedAt, x.Id).Encode(),
                attachments
                    .Where(a => a.MessageId == x.Id && x.DeletedAt == null)
                    .Select(a => new AttachmentDto(a.MediaId, a.ContentType, a.Size, a.DurationMs))
                    .ToArray(),
                Guid.TryParse(x.IdempotencyKey, out var clientId) ? clientId.ToString() : null,
                x.DeletedAt,
                x.CoachingEntryJson == null
                    ? null
                    : JsonSerializer.Deserialize<CoachingChatEntry>(x.CoachingEntryJson)
            ))
            .ToArray();
    }

    public async Task<ConversationDto> GetAsync(Guid id, CancellationToken ct)
    {
        var m = await Member(id, false, ct);
        var c = await Conversation(id, ct);
        var last = await Visible(id)
            .OrderByDescending(x => x.CreatedAt)
            .ThenByDescending(x => x.Id)
            .FirstOrDefaultAsync(ct);
        var unread = await Visible(id)
            .LongCountAsync(x => x.SenderUserId != Actor && x.Sequence > m.LastReadSequence, ct);
        var members = await ReadMembersAsync(id, ct);
        var title =
            c.Type == ConversationType.Direct
                ? members.FirstOrDefault(x => x.UserId != Actor)?.DisplayName
                    ?? "Unavailable account"
                : c.Title;
        var request = c.Type == ConversationType.Direct ? await LatestRequestAsync(id, ct) : null;
        var canSend =
            m.State == MemberState.Active
            && (request == null || request.State == RequestState.Accepted)
            && (
                c.Type != ConversationType.Direct
                || !await Blocked(c.PairFirst!.Value, c.PairSecond!.Value, ct)
            );
        var canUpload = canSend && !await RequiresFirstMessageApprovalAsync(c, ct);
        return new(
            c.Id,
            c.Type,
            title,
            c.ClientGroupId,
            m.State,
            last == null ? null : (await Dtos([last], ct))[0],
            unread,
            members,
            request == null ? null : await RequestDtoAsync(request, ct),
            canSend,
            canUpload
        );
    }

    public async Task<MemberDto[]> MembersAsync(Guid id, CancellationToken ct)
    {
        await Member(id, false, ct);
        return await ReadMembersAsync(id, ct);
    }

    private async Task<MemberDto[]> ReadMembersAsync(Guid id, CancellationToken ct)
    {
        // Recheck current membership in the roster query, including a removal after authorization.
        var rows = await db
            .Members.AsNoTracking()
            .Where(x =>
                x.ConversationId == id
                && (
                    x.UserId == Actor
                    || db.Members.Any(viewer =>
                        viewer.ConversationId == id
                        && viewer.UserId == Actor
                        && viewer.State == MemberState.Active
                    )
                )
            )
            .ToArrayAsync(ct);
        var people = await directory.GetAccountsAsync(rows.Select(x => x.UserId).ToArray(), ct);
        return rows.Select(x => new MemberDto(
                x.UserId,
                people.TryGetValue(x.UserId, out var p) ? p.DisplayName : "Unavailable account",
                x.Role,
                x.Source,
                x.State,
                x.Excluded,
                x.JoinedAt,
                x.RemovedAt,
                x.LastReadMessageId,
                people.GetValueOrDefault(x.UserId)?.Username
            ))
            .ToArray();
    }

    public async Task<ConversationDto[]> ListAsync(
        string? search,
        int limit,
        CancellationToken ct,
        int page = 1
    )
    {
        if ((await accounts.GetRolesAsync(ct)).Count == 0)
            throw new ApiException(403, "ONBOARDING_REQUIRED", "Complete onboarding.");
        var features = await access.GetAsync(ct);
        var direct = features.Features.Any(x => x.Key == "messaging.direct" && x.Available);
        var groups = features.Features.Any(x => x.Key == "messaging.groups" && x.Available);
        if (!direct && !groups)
            throw new ApiException(403, "FEATURE_UNAVAILABLE", "Messaging is unavailable.");
        MessagingRules.Text(search, 200);
        if (limit is < 1 or > 100)
            throw ApiException.Invalid("Limit must be 1 to 100.");
        if (page is < 1 or > 1000000)
            throw ApiException.Invalid("Page must be 1 to 1000000.");
        var query =
            from c in db.Conversations.AsNoTracking()
            join m in db.Members.AsNoTracking() on c.Id equals m.ConversationId
            where m.UserId == Actor && (c.Type == ConversationType.Direct ? direct : groups)
            select new { Conversation = c, Membership = m };
        if (!string.IsNullOrWhiteSpace(search))
        {
            var directPeers = await query
                .Where(x => x.Conversation.Type == ConversationType.Direct)
                .Select(x =>
                    x.Conversation.PairFirst == Actor
                        ? x.Conversation.PairSecond!.Value
                        : x.Conversation.PairFirst!.Value
                )
                .Distinct()
                .ToArrayAsync(ct);
            var matches = await directory.FindNameMatchesAsync(directPeers, search, ct);
            var term = search.ToLowerInvariant();
            query = query.Where(x =>
                x.Conversation.Type == ConversationType.Direct
                    ? matches.Contains(
                        x.Conversation.PairFirst == Actor
                            ? x.Conversation.PairSecond!.Value
                            : x.Conversation.PairFirst!.Value
                    )
                    : x.Conversation.Title.ToLower().Contains(term)
            );
        }

        var rows = await query
            .OrderByDescending(x =>
                db.Messages.Where(msg =>
                        msg.ConversationId == x.Conversation.Id
                        && msg.SenderUserId != Actor
                        && (
                            !x.Membership.CutoffSequence.HasValue
                            || msg.Sequence <= x.Membership.CutoffSequence
                        )
                    )
                    .Select(msg => (DateTimeOffset?)msg.CreatedAt)
                    .Max()
                ?? DateTimeOffset.MinValue
            )
            .ThenByDescending(x => x.Conversation.CreatedAt)
            .ThenBy(x => x.Conversation.Id)
            .Skip((page - 1) * limit)
            .Take(limit)
            .Select(x => new
            {
                x.Conversation,
                x.Membership,
                Last = db
                    .Messages.Where(msg =>
                        msg.ConversationId == x.Conversation.Id
                        && (
                            !x.Membership.CutoffSequence.HasValue
                            || msg.Sequence <= x.Membership.CutoffSequence
                        )
                    )
                    .OrderByDescending(msg => msg.CreatedAt)
                    .ThenByDescending(msg => msg.Id)
                    .FirstOrDefault(),
                Unread = db.Messages.LongCount(msg =>
                    msg.ConversationId == x.Conversation.Id
                    && msg.SenderUserId != Actor
                    && msg.Sequence > x.Membership.LastReadSequence
                    && (
                        !x.Membership.CutoffSequence.HasValue
                        || msg.Sequence <= x.Membership.CutoffSequence
                    )
                ),
            })
            .ToArrayAsync(ct);
        if (rows.Length == 0)
            return [];
        var ids = rows.Select(x => x.Conversation.Id).ToArray();
        var members = await db
            .Members.AsNoTracking()
            .Where(x => ids.Contains(x.ConversationId))
            .ToArrayAsync(ct);
        var people = await directory.GetAccountsAsync(
            members.Select(x => x.UserId).Distinct().ToArray(),
            ct
        );
        var directIds = rows.Where(x => x.Conversation.Type == ConversationType.Direct)
            .Select(x => x.Conversation.Id)
            .ToArray();
        var requests =
            directIds.Length == 0
                ? []
                : await db
                    .Requests.AsNoTracking()
                    .Where(x =>
                        x.ConversationId.HasValue && directIds.Contains(x.ConversationId.Value)
                    )
                    .OrderByDescending(x => x.CreatedAt)
                    .ThenByDescending(x => x.Id)
                    .ToArrayAsync(ct);
        var blockedUsers =
            directIds.Length == 0
                ? []
                : await db
                    .Blocks.AsNoTracking()
                    .Where(x => x.UserId == Actor || x.BlockedUserId == Actor)
                    .Select(x => x.UserId == Actor ? x.BlockedUserId : x.UserId)
                    .ToArrayAsync(ct);
        var requestDtos = await RequestDtosAsync(requests, ct);
        var emptyPeers = rows.Where(x =>
                x.Conversation.Type == ConversationType.Direct && x.Conversation.Sequence == 0
            )
            .Select(x =>
                x.Conversation.PairFirst == Actor
                    ? x.Conversation.PairSecond!.Value
                    : x.Conversation.PairFirst!.Value
            )
            .ToArray();
        var privatePeers =
            emptyPeers.Length == 0
                ? []
                : await db
                    .Preferences.AsNoTracking()
                    .Where(x => emptyPeers.Contains(x.UserId) && x.RequireApproval)
                    .Select(x => x.UserId)
                    .ToArrayAsync(ct);
        var lastDtos = (
            await Dtos(rows.Where(x => x.Last != null).Select(x => x.Last!).ToArray(), ct)
        ).ToDictionary(x => x.Id);
        return rows.Select(row =>
            {
                var c = row.Conversation;
                var title =
                    c.Type == ConversationType.Direct
                        ? people
                            .GetValueOrDefault(
                                c.PairFirst == Actor ? c.PairSecond!.Value : c.PairFirst!.Value
                            )
                            ?.DisplayName
                            ?? "Unavailable account"
                        : c.Title;
                var summary = members
                    .Where(x =>
                        x.ConversationId == c.Id
                        && (
                            row.Membership.State == MemberState.Active
                                ? x.State == MemberState.Active
                                : x.UserId == Actor
                        )
                    )
                    .Select(x => new MemberDto(
                        x.UserId,
                        people.GetValueOrDefault(x.UserId)?.DisplayName ?? "Unavailable account",
                        x.Role,
                        x.Source,
                        x.State,
                        x.Excluded,
                        x.JoinedAt,
                        x.RemovedAt,
                        x.LastReadMessageId,
                        people.GetValueOrDefault(x.UserId)?.Username
                    ))
                    .ToArray();
                var request = requests.FirstOrDefault(x => x.ConversationId == c.Id);
                var canSend =
                    row.Membership.State == MemberState.Active
                    && (request == null || request.State == RequestState.Accepted)
                    && (
                        c.Type != ConversationType.Direct
                        || !blockedUsers.Contains(
                            c.PairFirst == Actor ? c.PairSecond!.Value : c.PairFirst!.Value
                        )
                    );
                var canUpload =
                    canSend
                    && (
                        c.Type != ConversationType.Direct
                        || c.Sequence > 0
                        || !privatePeers.Contains(
                            c.PairFirst == Actor ? c.PairSecond!.Value : c.PairFirst!.Value
                        )
                    );
                return new ConversationDto(
                    c.Id,
                    c.Type,
                    title,
                    c.ClientGroupId,
                    row.Membership.State,
                    row.Last == null ? null : lastDtos[row.Last.Id],
                    row.Unread,
                    summary,
                    request == null ? null : requestDtos[request.Id],
                    canSend,
                    canUpload
                );
            })
            .ToArray();
    }

    public async Task ReadAsync(Guid id, Guid messageId, CancellationToken ct)
    {
        await tx.RunAsync(
            async token =>
            {
                await Lock("messaging-conversation:" + id, token);
                var current = await Member(id, false, token);
                var message =
                    await Visible(id).SingleOrDefaultAsync(x => x.Id == messageId, token)
                    ?? throw ApiException.NotFound();
                await db
                    .Members.Where(x =>
                        x.ConversationId == id
                        && x.UserId == Actor
                        && x.LastReadSequence < message.Sequence
                    )
                    .ExecuteUpdateAsync(
                        s =>
                            s.SetProperty(x => x.LastReadSequence, message.Sequence)
                                .SetProperty(x => x.LastReadMessageId, message.Id)
                                .SetProperty(x => x.LastReadAt, clock.GetUtcNow()),
                        token
                    );
                // Resolve only unread events and use message sequence, not timestamps, to preserve newer notifications.
                var eventKeys = await notificationReads.UnreadEventKeysAsync(
                    Actor,
                    "Messaging",
                    id,
                    "MessageCreated",
                    token
                );
                var candidates = eventKeys
                    .Where(key => key.StartsWith("message:", StringComparison.Ordinal))
                    .Select(key => Guid.TryParse(key[8..], out var value) ? value : Guid.Empty)
                    .Where(value => value != Guid.Empty)
                    .ToArray();
                if (candidates.Length > 0)
                {
                    var through = Math.Max(current.LastReadSequence, message.Sequence);
                    var readIds = await db
                        .Messages.Where(x =>
                            x.ConversationId == id
                            && x.Sequence <= through
                            && candidates.Contains(x.Id)
                        )
                        .Select(x => x.Id)
                        .ToArrayAsync(token);
                    await notificationReads.MarkReadAsync(
                        Actor,
                        readIds.Select(value => "message:" + value).ToArray(),
                        token
                    );
                }
            },
            ct
        );
        await dispatcher.ConversationAsync(
            id,
            "ReadMarkerChanged",
            new { ConversationId = id, UserId = Actor },
            ct,
            Actor
        );
    }

    public async Task<(Stream Stream, string ContentType)> AttachmentAsync(
        Guid messageId,
        Guid mediaId,
        CancellationToken ct
    )
    {
        await Feature("messaging.attachments", ct);
        var msg =
            await db
                .Messages.AsNoTracking()
                .SingleOrDefaultAsync(x => x.Id == messageId && x.DeletedAt == null, ct)
            ?? throw ApiException.NotFound();
        var m = await Member(msg.ConversationId, false, ct);
        if (m.CutoffSequence.HasValue && msg.Sequence > m.CutoffSequence)
            throw ApiException.NotFound();
        var a =
            await db
                .Attachments.AsNoTracking()
                .SingleOrDefaultAsync(x => x.MessageId == messageId && x.MediaId == mediaId, ct)
            ?? throw ApiException.NotFound();
        return (await media.OpenReadAsync(a.MediaId, a.OwnerId, ct), a.ContentType);
    }

    public async Task<RequestDto> RequestAsync(ContactRequest request, CancellationToken ct)
    {
        await Feature("messaging.direct", ct);
        MessagingRules.Text(request.Body, 2000, true);
        MessagingRules.Pair(Actor, request.UserId);
        await Known([request.UserId], ct);
        var r = await tx.RunAsync(
            async token =>
            {
                await PairLock(Actor, request.UserId, token);
                await NotBlocked(Actor, request.UserId, token);
                var pair = MessagingRules.Pair(Actor, request.UserId);
                var pending = await db.Requests.SingleOrDefaultAsync(
                    x =>
                        x.PairFirst == pair.First
                        && x.PairSecond == pair.Second
                        && x.State == RequestState.Pending,
                    token
                );
                if (pending != null)
                {
                    if (pending.SenderUserId != Actor)
                        throw ApiException.Conflict("Respond to the incoming request.");
                    if (pending.Body != request.Body)
                        throw ApiException.Conflict("A request is already pending.");
                    return pending;
                }

                var c = await CreateDirect(Actor, request.UserId, token);
                var latest = await LatestRequestAsync(c.Id, token);
                if (c.Sequence > 0 && (latest == null || latest.State == RequestState.Accepted))
                    throw ApiException.Conflict("Use the existing conversation.");
                var approval = await RequiresApprovalAsync(request.UserId, token);
                if (abuse is not null)
                    await abuse.RequireAsync(
                        Actor,
                        AbusePolicies.Message,
                        cancellationToken: token
                    );
                await AdmitDirectContactAsync(c, token);
                await Lock("messaging-conversation:" + c.Id, token);
                await db.Entry(c).ReloadAsync(token);
                var row = new MessageRequest
                {
                    SenderUserId = Actor,
                    RecipientUserId = request.UserId,
                    PairFirst = pair.First,
                    PairSecond = pair.Second,
                    Body = request.Body,
                    ConversationId = c.Id,
                    State = approval ? RequestState.Pending : RequestState.Accepted,
                    CreatedAt = clock.GetUtcNow(),
                    UpdatedAt = clock.GetUtcNow(),
                };
                db.Requests.Add(row);
                await db.SaveChangesAsync(token);
                row.IntroductionMessageId = (
                    await AppendEntryAsync(c, Actor, "request:" + row.Id, row.Body, null, token)
                ).Id;
                await db.SaveChangesAsync(token);
                return row;
            },
            ct
        );
        var dto = await RequestDtoAsync(r, ct);
        await dispatcher.UserAsync(r.RecipientUserId, "MessageRequestCreated", dto, ct);
        return dto;
    }

    public async Task<RequestDto[]> RequestsAsync(
        CancellationToken ct,
        int? page = null,
        int? limit = null
    )
    {
        await Feature("messaging.direct", ct);
        var number = page ?? 1;
        var size = limit ?? (page.HasValue ? 25 : 100);
        if (number is < 1 or > 1000000 || size is < 1 or > 100)
            throw ApiException.Invalid("Page must be 1 to 1000000 and limit 1 to 100.");
        var rows = await db
            .Requests.AsNoTracking()
            .Where(x => x.RecipientUserId == Actor || x.SenderUserId == Actor)
            .OrderByDescending(x => x.CreatedAt)
            .ThenBy(x => x.Id)
            .Skip((number - 1) * size)
            .Take(size)
            .ToArrayAsync(ct);
        var people = await directory.GetAccountsAsync(
            rows.SelectMany(x => new[] { x.SenderUserId, x.RecipientUserId }).Distinct().ToArray(),
            ct
        );
        var dtos = await RequestDtosAsync(rows, ct);
        return rows.Select(row =>
                dtos[row.Id] with
                {
                    SenderDisplayName = people.GetValueOrDefault(row.SenderUserId)?.DisplayName,
                    RecipientDisplayName = people
                        .GetValueOrDefault(row.RecipientUserId)
                        ?.DisplayName,
                }
            )
            .ToArray();
    }

    public async Task<RequestDto> RespondAsync(Guid id, RequestState state, CancellationToken ct)
    {
        await Feature("messaging.direct", ct);
        var row =
            await db
                .Requests.AsNoTracking()
                .SingleOrDefaultAsync(
                    x => x.Id == id && (x.RecipientUserId == Actor || x.SenderUserId == Actor),
                    ct
                )
            ?? throw ApiException.NotFound();
        if (
            state == RequestState.Cancelled
                ? row.SenderUserId != Actor
                : row.RecipientUserId != Actor
        )
            throw ApiException.NotFound();
        var result = await tx.RunAsync(
            async token =>
            {
                await PairLock(row.SenderUserId, row.RecipientUserId, token);
                var r = await db.Requests.SingleAsync(x => x.Id == id, token);
                if (r.State == state)
                    return r;
                if (r.State != RequestState.Pending)
                    throw ApiException.Conflict("Request has already been resolved.");
                if (state == RequestState.Accepted)
                {
                    await NotBlocked(r.SenderUserId, r.RecipientUserId, token);
                    var c = await CreateDirect(r.SenderUserId, r.RecipientUserId, token);
                    r.ConversationId = c.Id;
                    // Older clients may still resolve a request created before conversation unification.
                    if (
                        !await db.Messages.AnyAsync(
                            x => x.ConversationId == c.Id && x.IdempotencyKey == "request:" + r.Id,
                            token
                        )
                        && c.Sequence == 0
                    )
                        r.IntroductionMessageId = (
                            await AppendEntryAsync(
                                c,
                                r.SenderUserId,
                                "request:" + r.Id,
                                r.Body,
                                null,
                                token
                            )
                        ).Id;
                }

                if (state is RequestState.Accepted or RequestState.Declined)
                    await notifications.PublishAsync(
                        new(
                            r.SenderUserId,
                            "request:" + r.Id + ":" + state,
                            "MessageRequest" + state,
                            "Messaging",
                            "Messaging",
                            r.ConversationId ?? r.Id,
                            "/app/messages?conversation=" + r.ConversationId
                        ),
                        token
                    );
                r.State = state;
                r.UpdatedAt = clock.GetUtcNow();
                await db.SaveChangesAsync(token);
                return r;
            },
            ct
        );
        var dto = await RequestDtoAsync(result, ct);
        await dispatcher.UserAsync(result.SenderUserId, "MessageRequestUpdated", dto, ct);
        await dispatcher.UserAsync(result.RecipientUserId, "MessageRequestUpdated", dto, ct);
        return dto;
    }

    public async Task BlockAsync(Guid user, bool blocked, CancellationToken ct)
    {
        await Feature("messaging.direct", ct);
        MessagingRules.Pair(Actor, user);
        await Known([user], ct);
        await tx.RunAsync(
            async token =>
            {
                await PairLock(Actor, user, token);
                var b = await db.Blocks.SingleOrDefaultAsync(
                    x => x.UserId == Actor && x.BlockedUserId == user,
                    token
                );
                if (blocked && b == null)
                    db.Blocks.Add(
                        new()
                        {
                            UserId = Actor,
                            BlockedUserId = user,
                            CreatedAt = clock.GetUtcNow(),
                        }
                    );
                if (!blocked && b != null)
                    db.Blocks.Remove(b);
                if (blocked)
                {
                    var pair = MessagingRules.Pair(Actor, user);
                    foreach (
                        var r in await db
                            .Requests.Where(x =>
                                x.PairFirst == pair.First
                                && x.PairSecond == pair.Second
                                && x.State == RequestState.Pending
                            )
                            .ToArrayAsync(token)
                    )
                    {
                        r.State = RequestState.Cancelled;
                        r.UpdatedAt = clock.GetUtcNow();
                    }
                }

                await db.SaveChangesAsync(token);
            },
            ct
        );
    }

    public async Task<Guid[]> BlocksAsync(CancellationToken ct)
    {
        await Feature("messaging.direct", ct);
        return await db
            .Blocks.Where(x => x.UserId == Actor)
            .Select(x => x.BlockedUserId)
            .ToArrayAsync(ct);
    }

    public async Task<Guid> ReportAsync(Guid id, ReportRequest request, CancellationToken ct)
    {
        await Feature("messaging.report", ct);
        MessagingRules.Text(request.Category, 100, true);
        MessagingRules.Text(request.Details, 2000);
        return await tx.RunAsync(
            async token =>
            {
                var msg =
                    await db.Messages.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id, token)
                    ?? throw ApiException.NotFound();
                var m = await Member(msg.ConversationId, false, token);
                if (m.CutoffSequence.HasValue && msg.Sequence > m.CutoffSequence)
                    throw ApiException.NotFound();
                var dto = (await Dtos([msg], token))[0];
                var report = new MessageReport
                {
                    ReporterUserId = Actor,
                    MessageId = id,
                    ConversationId = msg.ConversationId,
                    Category = request.Category.Trim(),
                    Details = request.Details,
                    Evidence = JsonSerializer.Serialize(dto),
                    CreatedAt = clock.GetUtcNow(),
                };
                db.Reports.Add(report);
                await db.SaveChangesAsync(token);
                return report.Id;
            },
            ct
        );
    }

    public async Task ActiveAsync(Guid id, CancellationToken ct)
    {
        await Member(id, true, ct);
        var c = await Conversation(id, ct);
        if (c.Type == ConversationType.Direct)
            await NotBlocked(c.PairFirst!.Value, c.PairSecond!.Value, ct);
        else
            await Feature("messaging.groups", ct);
    }
}
