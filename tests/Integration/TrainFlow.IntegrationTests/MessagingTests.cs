using TrainFlow.Access.Domain;
using TrainFlow.Access.Infrastructure;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.DependencyInjection.Extensions;
using TrainFlow.Media.Contracts;
using TrainFlow.BuildingBlocks;
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Data.Common;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using TrainFlow.Coaching.Contracts;
using TrainFlow.Messaging.Domain;
using TrainFlow.Messaging.Features;
using TrainFlow.Messaging.Infrastructure;

namespace TrainFlow.IntegrationTests;

public sealed class MessagingTests
{
    [CatalogPostgresFact]
    public async Task Deleted_introductions_are_redacted_from_every_request_projection_and_retry()
    {
        using var f = new ApiFactory(Database);
        var realtime = new TestHubContext();
        using var app = f.WithWebHostBuilder(builder => builder.ConfigureServices(services =>
            services.Replace(ServiceDescriptor.Singleton<IHubContext<MessagingHub>>(realtime))));
        var sender = await User(f, "Coach", app.CreateClient);
        var recipient = await User(f, "Client", app.CreateClient);
        await Ok(recipient.Http.PutAsJsonAsync("/api/v1/me/messaging-preferences", new { requireApproval = true }));
        var input = new { userId = recipient.Id, body = "Private introduction" };
        var request = await Ok(sender.Http.PostAsJsonAsync(Root + "/requests", input));
        var conversation = request.GetProperty("conversationId").GetGuid();
        var requestId = request.GetProperty("id").GetGuid();
        var intro = Assert.Single((await History(sender.Http, conversation)).GetProperty("items").EnumerateArray());
        await Ok(sender.Http.DeleteAsync(Root + "/messages/" + intro.GetProperty("id").GetGuid()));
        realtime.RequestEvents.Clear();
        foreach (var http in new[] { sender.Http, recipient.Http })
        {
            Assert.Equal("", (await Ok(http.GetAsync(Root + "/conversations/" + conversation))).GetProperty("request").GetProperty("body").GetString());
            Assert.Equal("", Assert.Single((await Ok(http.GetAsync(Root + "/conversations"))).EnumerateArray()).GetProperty("request").GetProperty("body").GetString());
            Assert.Equal("", Assert.Single((await Ok(http.GetAsync(Root + "/requests"))).EnumerateArray()).GetProperty("body").GetString());
        }
        Assert.Equal("", (await Ok(sender.Http.PostAsJsonAsync(Root + "/requests", input))).GetProperty("body").GetString());
        Assert.Equal("", (await Ok(recipient.Http.PostAsync(Root + $"/requests/{requestId}/accept", null))).GetProperty("body").GetString());
        Assert.NotEmpty(realtime.RequestEvents);
        Assert.All(realtime.RequestEvents, dto => Assert.Equal("", dto.Body));
    }

    [CatalogPostgresFact]
    public async Task First_send_rechecks_approval_after_an_empty_conversation_was_opened()
    {
        using var f = new ApiFactory(Database);
        var sender = await User(f, "Coach");
        var recipient = await User(f, "Client");
        var chat = await Ok(sender.Http.PostAsJsonAsync(Root + "/conversations/direct", new { userId = recipient.Id }));
        var id = chat.GetProperty("id").GetGuid();
        await Ok(recipient.Http.PutAsJsonAsync("/api/v1/me/messaging-preferences", new { requireApproval = true }));
        var detail = await Ok(sender.Http.GetAsync(Root + "/conversations/" + id));
        Assert.True(detail.GetProperty("canSendMessages").GetBoolean());
        Assert.False(detail.GetProperty("canUploadAttachments").GetBoolean());
        Assert.False(Assert.Single((await Ok(sender.Http.GetAsync(Root + "/conversations"))).EnumerateArray()).GetProperty("canUploadAttachments").GetBoolean());
        Assert.Equal(HttpStatusCode.Forbidden, (await sender.Http.PostAsJsonAsync(Root + "/uploads?conversationId=" + id, new { name = "test.png", contentType = "image/png", size = 20 })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await SendResponse(sender.Http, id, "No reply", reply: Guid.NewGuid())).StatusCode);
        using var attachment = new HttpRequestMessage(HttpMethod.Post, Root + $"/conversations/{id}/messages")
        {
            Content = JsonContent.Create(new { type = "Image", mediaIds = new[] { Guid.NewGuid() } })
        };
        attachment.Headers.Add("Idempotency-Key", Guid.NewGuid().ToString());
        Assert.Equal(HttpStatusCode.Forbidden, (await sender.Http.SendAsync(attachment)).StatusCode);
        var key = Guid.NewGuid().ToString();
        var body = new string('a', 8000);
        var message = await Send(sender.Http, id, body, key);
        Assert.Equal(message.GetProperty("id").GetGuid(), (await Send(sender.Http, id, body, key)).GetProperty("id").GetGuid());
        detail = await Ok(recipient.Http.GetAsync(Root + "/conversations/" + id));
        Assert.False(detail.GetProperty("canSendMessages").GetBoolean());
        Assert.Equal("Pending", detail.GetProperty("request").GetProperty("state").GetString());
        Assert.Equal(body, detail.GetProperty("request").GetProperty("body").GetString());
        Assert.Equal(HttpStatusCode.Forbidden, (await SendResponse(sender.Http, id, "Second")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await SendResponse(recipient.Http, id, "Reply before accepting")).StatusCode);
        await Ok(sender.Http.DeleteAsync(Root + "/messages/" + message.GetProperty("id").GetGuid()));
        var response = await Ok(recipient.Http.PostAsync(Root + "/requests/" + detail.GetProperty("request").GetProperty("id").GetGuid() + "/accept", null));
        Assert.Equal("", response.GetProperty("body").GetString());
        await Send(sender.Http, id, "After acceptance");
    }

    [CatalogPostgresFact]
    public async Task Strangers_can_open_and_send_without_approval_by_default()
    {
        using var f = new ApiFactory(Database);
        var sender = await User(f, "Coach");
        var recipient = await User(f, "Client");
        var chat = await Ok(sender.Http.PostAsJsonAsync(Root + "/conversations/direct", new { userId = recipient.Id }));
        var id = chat.GetProperty("id").GetGuid();
        await Send(sender.Http, id, "Hello");
        await Send(recipient.Http, id, "Welcome");
        Assert.Equal(2, (await History(recipient.Http, id)).GetProperty("items").GetArrayLength());
    }

    [CatalogPostgresFact]
    public async Task Explicit_approval_keeps_intro_in_chat_and_denies_pending_mutations()
    {
        using var f = new ApiFactory(Database);
        var sender = await User(f, "Coach");
        var recipient = await User(f, "Client");
        await Activate(f, sender.Id, recipient.Id);
        await Ok(recipient.Http.PutAsJsonAsync("/api/v1/me/messaging-preferences", new { requireApproval = true }));
        var request = await Ok(sender.Http.PostAsJsonAsync(Root + "/requests", new { userId = recipient.Id, body = "Hello" }));
        var id = request.GetProperty("conversationId").GetGuid();
        var requestId = request.GetProperty("id").GetGuid();
        Assert.Equal("Pending", request.GetProperty("state").GetString());
        Assert.Single((await History(recipient.Http, id)).GetProperty("items").EnumerateArray());
        var listed = Assert.Single((await Ok(sender.Http.GetAsync(Root + "/conversations"))).EnumerateArray());
        Assert.False(listed.GetProperty("canSendMessages").GetBoolean());
        Assert.False(listed.GetProperty("canUploadAttachments").GetBoolean());
        Assert.Equal(requestId, listed.GetProperty("request").GetProperty("id").GetGuid());
        Assert.Equal(HttpStatusCode.Forbidden, (await SendResponse(sender.Http, id, "Second")).StatusCode);
        var introduction = Assert.Single((await History(sender.Http, id)).GetProperty("items").EnumerateArray());
        Assert.Equal(HttpStatusCode.Forbidden, (await SendResponse(sender.Http, id, "Reply", reply: introduction.GetProperty("id").GetGuid())).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await sender.Http.PostAsJsonAsync("/api/v1/messaging/uploads?conversationId=" + id, new { name = "test.png", contentType = "image/png", size = 20 })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await sender.Http.PostAsync($"/api/v1/messaging/uploads/{Guid.NewGuid()}/finalize?conversationId={id}", null)).StatusCode);
        await Ok(recipient.Http.PostAsync(Root + $"/requests/{requestId}/accept", null));
        await Send(sender.Http, id, "Accepted");
        Assert.Equal(2, (await History(recipient.Http, id)).GetProperty("items").GetArrayLength());
    }

    [CatalogPostgresFact]
    public async Task Rejoining_members_obey_capacity_and_active_adds_remain_idempotent()
    {
        using var f = new ApiFactory(Database);
        using var app = f.WithWebHostBuilder(builder => builder.ConfigureServices(services =>
            services.Configure<MessagingOptions>(options => options.MaxGroupMembers = 2)));
        var owner = await User(f, "Coach", app.CreateClient);
        var former = await User(f, "Client", app.CreateClient);
        var replacement = await User(f, "Client", app.CreateClient);
        var id = await Group(owner.Http, [former.Id]);
        var members = Root + $"/conversations/{id}/members";
        Assert.Equal(HttpStatusCode.NoContent, (await owner.Http.DeleteAsync(members + $"/{former.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await owner.Http.PostAsync(members + $"/{former.Id}/unban", null)).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await owner.Http.PostAsJsonAsync(members, new { userId = replacement.Id })).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await owner.Http.PostAsJsonAsync(members, new { userId = former.Id })).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await owner.Http.PostAsJsonAsync(members, new { userId = replacement.Id })).StatusCode);
        using var db = Db();
        Assert.Equal(2, await db.Members.CountAsync(x => x.ConversationId == id && x.State == MemberState.Active));
        Assert.Equal(MemberState.Removed, (await db.Members.SingleAsync(x => x.ConversationId == id && x.UserId == former.Id)).State);
        Assert.Equal(HttpStatusCode.NoContent, (await owner.Http.DeleteAsync(members + $"/{replacement.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await owner.Http.PostAsJsonAsync(members, new { userId = former.Id })).StatusCode);
    }

    [CatalogPostgresFact]
    public async Task Reading_chat_persists_notification_reads_without_consuming_newer_or_other_conversation_events()
    {
        using var f = new ApiFactory(Database);
        var reader = await User(f, "Coach");
        var sender = await User(f, "Coach");
        var chat = await Group(reader.Http, [sender.Id]);
        var other = await Group(reader.Http, [sender.Id]);
        var first = await Send(sender.Http, chat, "First");
        var second = await Send(sender.Http, chat, "Second");
        await Send(sender.Http, other, "Other conversation");
        async Task Read(Guid messageId) => (await reader.Http.PostAsJsonAsync(Root + $"/conversations/{chat}/read", new { messageId })).EnsureSuccessStatusCode();
        async Task<int> Count() => (await reader.Http.GetFromJsonAsync<TrainFlow.Notifications.NotificationCountDto>("/api/v1/me/notifications/unread-count"))!.Count;
        Assert.Equal(3, await Count());
        await Read(first.GetProperty("id").GetGuid());
        Assert.Equal(2, await Count());
        await Read(first.GetProperty("id").GetGuid());
        Assert.Equal(2, await Count());
        await Read(second.GetProperty("id").GetGuid());
        Assert.Equal(1, await Count());
        var third = await Send(sender.Http, chat, "After reading");
        await Read(first.GetProperty("id").GetGuid());
        Assert.Equal(2, await Count());
        await Read(third.GetProperty("id").GetGuid());
        Assert.Equal(1, await Count());
        var notifications = await reader.Http.GetFromJsonAsync<TrainFlow.Notifications.NotificationPage>("/api/v1/me/notifications");
        Assert.All(notifications!.Items.Where(n => n.SourceId == chat), n => Assert.NotNull(n.ReadAt));
        Assert.Null(Assert.Single(notifications.Items, n => n.SourceId == other).ReadAt);
    }

    private const string Root = "/api/v1/messaging";
    private static string Database => Environment.GetEnvironmentVariable("TRAINFLOW_TEST_DATABASE")!;

    private static MessagingDbContext Db() => new(new DbContextOptionsBuilder<MessagingDbContext>().UseNpgsql(Database).Options);

    [CatalogPostgresFact]
    public async Task Conversation_reads_share_membership_lookup_and_skip_empty_related_queries()
    {
        var commands = new MessagingQueryLog();
        using var f = new ApiFactory(Database);
        using var app = f.WithWebHostBuilder(builder => builder.ConfigureServices(services =>
            services.AddDbContext<MessagingDbContext>(options => options.AddInterceptors(commands))));
        var owner = await User(f, "Coach", app.CreateClient);
        var peer = await User(f, "Coach", app.CreateClient);
        var outsider = await User(f, "Coach", app.CreateClient);
        var id = await Group(owner.Http, [peer.Id]);

        commands.Commands.Clear();
        Assert.Empty((await History(owner.Http, id)).GetProperty("items").EnumerateArray());
        Assert.Equal(2, commands.Commands.Count);

        await Send(peer.Http, id, "Incoming");
        commands.Commands.Clear();
        var detail = await Ok(owner.Http.GetAsync(Root + $"/conversations/{id}"));
        Assert.Equal("Incoming", detail.GetProperty("lastMessage").GetProperty("body").GetString());
        Assert.Equal(1, detail.GetProperty("unreadCount").GetInt64());
        Assert.Equal(2, detail.GetProperty("members").GetArrayLength());
        Assert.Equal(6, commands.Commands.Count);

        commands.Commands.Clear();
        Assert.Empty((await Ok(outsider.Http.GetAsync(Root + "/conversations"))).EnumerateArray());
        Assert.Single(commands.Commands);
        Assert.Equal(HttpStatusCode.NotFound, (await outsider.Http.GetAsync(Root + $"/conversations/{id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await outsider.Http.GetAsync(Root + $"/conversations/{id}/members")).StatusCode);
    }

    private sealed class MessagingQueryLog : DbCommandInterceptor
    {
        public System.Collections.Concurrent.ConcurrentQueue<string> Commands { get; } = new();
        public override ValueTask<InterceptionResult<DbDataReader>> ReaderExecutingAsync(DbCommand command, CommandEventData eventData,
            InterceptionResult<DbDataReader> result, CancellationToken cancellationToken = default)
        {
            Commands.Enqueue(command.CommandText);
            return ValueTask.FromResult(result);
        }
    }
    [CatalogPostgresFact]
    public async Task Sender_deletion_keeps_tombstone_and_denies_other_members()
    {
        using var f = new ApiFactory(Database);
        var sender = await User(f, "Coach");
        var peer = await User(f, "Coach");
        var id = await Group(sender.Http, [peer.Id]);
        var message = await Send(sender.Http, id, "Remove this text");
        var messageId = message.GetProperty("id").GetGuid();
        Assert.Equal(HttpStatusCode.NotFound, (await peer.Http.DeleteAsync(Root + $"/messages/{messageId}")).StatusCode);
        var deleted = await Ok(sender.Http.DeleteAsync(Root + $"/messages/{messageId}"));
        Assert.Equal(JsonValueKind.Null, deleted.GetProperty("body").ValueKind);
        Assert.Equal(JsonValueKind.String, deleted.GetProperty("deletedAt").ValueKind);
        Assert.Empty(deleted.GetProperty("attachments").EnumerateArray());
        var repeated = await Ok(sender.Http.DeleteAsync(Root + $"/messages/{messageId}"));
        Assert.Equal(deleted.GetProperty("deletedAt").GetString(), repeated.GetProperty("deletedAt").GetString());
        var history = await Ok(peer.Http.GetAsync(Root + $"/conversations/{id}/messages"));
        var tombstone = Assert.Single(history.GetProperty("items").EnumerateArray());
        Assert.Equal(messageId, tombstone.GetProperty("id").GetGuid());
        Assert.Equal(JsonValueKind.Null, tombstone.GetProperty("body").ValueKind);
    }

    [CatalogPostgresFact]
    public async Task Conversations_sort_by_last_received_message_before_applying_limit()
    {
        var commands = new MessagingQueryLog();
        using var f = new ApiFactory(Database);
        using var app = f.WithWebHostBuilder(builder => builder.ConfigureServices(services =>
            services.AddDbContext<MessagingDbContext>(options => options.AddInterceptors(commands))));
        var owner = await User(f, "Coach", app.CreateClient);
        var peer = await User(f, "Coach", app.CreateClient);
        var outsider = await User(f, "Coach", app.CreateClient);
        var older = await Group(owner.Http, [peer.Id]);
        var newer = await Group(owner.Http, [peer.Id]);
        await Send(peer.Http, older, "Earlier incoming");
        await Send(peer.Http, newer, "Latest incoming");
        await Send(owner.Http, older, "Outgoing must not reorder");
        var empty = await Group(owner.Http, []);
        var rows = await Ok(owner.Http.GetAsync(Root + "/conversations"));
        Assert.Equal(new[] { newer, older, empty },
            rows.EnumerateArray().Select(x => x.GetProperty("id").GetGuid()).ToArray());
        var limited = await Ok(owner.Http.GetAsync(Root + "/conversations?limit=1"));
        Assert.Equal(newer, Assert.Single(limited.EnumerateArray()).GetProperty("id").GetGuid());
        commands.Commands.Clear();
        var second = await Ok(owner.Http.GetAsync(Root + "/conversations?limit=1&page=2"));
        Assert.Equal(older, Assert.Single(second.EnumerateArray()).GetProperty("id").GetGuid());
        Assert.Contains(commands.Commands, sql => sql.Contains("LIMIT") && sql.Contains("OFFSET"));
        Assert.Equal(empty, Assert.Single((await Ok(owner.Http.GetAsync(Root + "/conversations?limit=1&page=3"))).EnumerateArray()).GetProperty("id").GetGuid());
        Assert.Empty((await Ok(owner.Http.GetAsync(Root + "/conversations?limit=1&page=4"))).EnumerateArray());
        Assert.Empty((await Ok(outsider.Http.GetAsync(Root + "/conversations?limit=1&page=2"))).EnumerateArray());
        foreach (var query in new[] { "page=0", "page=1000001", "limit=0", "limit=101" })
            Assert.Equal(HttpStatusCode.BadRequest, (await owner.Http.GetAsync(Root + "/conversations?" + query)).StatusCode);
    }

    [CatalogPostgresFact]
    public async Task Request_pages_keep_legacy_arrays_and_filter_participants_before_paging()
    {
        using var f = new ApiFactory(Database);
        var recipient = await User(f, "Coach");
        var first = await User(f, "Client");
        var second = await User(f, "Client");
        var outsider = await User(f, "Client");
        await Ok(recipient.Http.PutAsJsonAsync("/api/v1/me/messaging-preferences", new { requireApproval = true }));
        await Ok(first.Http.PostAsJsonAsync(Root + "/requests", new { userId = recipient.Id, body = "First" }));
        await Ok(second.Http.PostAsJsonAsync(Root + "/requests", new { userId = recipient.Id, body = "Second" }));
        var legacy = (await Ok(recipient.Http.GetAsync(Root + "/requests"))).EnumerateArray().ToArray();
        Assert.Equal(2, legacy.Length);
        Assert.Equal(legacy[0].GetProperty("id").GetGuid(), Assert.Single((await Ok(recipient.Http.GetAsync(Root + "/requests?limit=1"))).EnumerateArray()).GetProperty("id").GetGuid());
        Assert.Equal(legacy[1].GetProperty("id").GetGuid(), Assert.Single((await Ok(recipient.Http.GetAsync(Root + "/requests?page=2&limit=1"))).EnumerateArray()).GetProperty("id").GetGuid());
        Assert.Single((await Ok(first.Http.GetAsync(Root + "/requests?page=1&limit=1"))).EnumerateArray());
        Assert.Empty((await Ok(first.Http.GetAsync(Root + "/requests?page=2&limit=1"))).EnumerateArray());
        Assert.Empty((await Ok(outsider.Http.GetAsync(Root + "/requests?page=1&limit=1"))).EnumerateArray());
        foreach (var query in new[] { "page=0", "page=1000001", "limit=0", "limit=101" })
            Assert.Equal(HttpStatusCode.BadRequest, (await recipient.Http.GetAsync(Root + "/requests?" + query)).StatusCode);
    }

    [CatalogPostgresFact]
    public async Task People_autocomplete_limits_projection_and_excludes_blocked_users()
    {
        using var f = new ApiFactory(Database);
        var sender = await User(f, "Client");
        var recipient = await User(f, "Coach");
        var username = $"m{recipient.Id:N}"[..30];
        var people = await Ok(sender.Http.GetAsync(Root + "/people?search=" + username[..15]));
        var person = Assert.Single(people.EnumerateArray());
        Assert.Equal(recipient.Id, person.GetProperty("userId").GetGuid());
        Assert.Equal(new[] { "displayName", "userId", "username" }, person.EnumerateObject().Select(x => x.Name).Order().ToArray());
        Assert.Empty((await Ok(sender.Http.GetAsync(Root + "/people?search=m"))).EnumerateArray());
        await recipient.Http.PostAsync($"/api/v1/me/blocked-users/{sender.Id}", null);
        Assert.Empty((await Ok(sender.Http.GetAsync(Root + "/people?search=" + username))).EnumerateArray());
        Assert.Empty((await Ok(sender.Http.GetAsync(Root + "/people?search=" + $"m{sender.Id:N}"[..30]))).EnumerateArray());
        using var anonymous = f.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync(Root + "/people?search=test")).StatusCode);
    }

    [CatalogPostgresFact]
    public async Task Username_requests_resolve_exact_active_accounts_and_keep_block_rules()
    {
        using var f = new ApiFactory(Database);
        var sender = await User(f, "Client");
        var recipient = await User(f, "Coach");
        var username = $"m{recipient.Id:N}"[..30];
        var request = await Ok(sender.Http.PostAsJsonAsync(Root + "/requests/by-username", new
        {
            username,
            body = "Hello coach"
        }));
        Assert.Equal(recipient.Id, request.GetProperty("recipientUserId").GetGuid());
        Assert.Equal(HttpStatusCode.NotFound, (await sender.Http.PostAsJsonAsync(Root + "/requests/by-username", new
        {
            username = "missing_" + Guid.NewGuid().ToString("N")[..12],
            body = "Hello"
        })).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await recipient.Http.PostAsync($"/api/v1/me/blocked-users/{sender.Id}", null)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await sender.Http.PostAsJsonAsync(Root + "/requests/by-username", new
        {
            username,
            body = "Hello again"
        })).StatusCode);
    }

    [CatalogPostgresFact]
    public async Task Direct_pair_is_canonical_concurrent_and_isolated_across_accounts()
    {
        using var f = new ApiFactory(Database);
        var a = await User(f, "Coach");
        var b = await User(f, "Client");
        var otherCoach = await User(f, "Coach");
        await Activate(f, a.Id, b.Id);
        await Activate(f, otherCoach.Id, b.Id);
        Assert.Equal(HttpStatusCode.BadRequest, (await a.Http.PostAsJsonAsync(Root + "/conversations/direct", new
        {
            userId = a.Id
        })).StatusCode);
        var responses = await Task.WhenAll(Enumerable.Range(0, 12).Select(i => (i % 2 == 0 ? a.Http : b.Http).PostAsJsonAsync(Root + "/conversations/direct", new { userId = i % 2 == 0 ? b.Id : a.Id })));
        var ids = new List<Guid>();
        foreach (var response in responses)
        {
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            ids.Add((await Json(response)).GetProperty("id").GetGuid());
        }

        Assert.Single(ids.Distinct());
        var id = ids[0];
        var detail = await Ok(a.Http.GetAsync(Root + $"/conversations/{id}"));
        var peer = detail.GetProperty("members").EnumerateArray().Single(x => x.GetProperty("userId").GetGuid() == b.Id);
        Assert.Equal(peer.GetProperty("displayName").GetString(), detail.GetProperty("title").GetString());
        Assert.Equal($"m{b.Id:N}"[..30], peer.GetProperty("username").GetString());
        Assert.Equal(HttpStatusCode.NotFound, (await otherCoach.Http.GetAsync(Root + $"/conversations/{id}")).StatusCode);
        a.Http.DefaultRequestHeaders.Authorization = new("Bearer", f.Token(otherCoach.Id));
        Assert.Equal(HttpStatusCode.NotFound, (await a.Http.GetAsync(Root + $"/conversations/{id}/messages")).StatusCode);
        using var db = Db();
        Assert.Equal(1, await db.Conversations.CountAsync(x => x.Id == id));
    }

    [CatalogPostgresFact]
    public async Task Stranger_request_lifecycle_blocks_and_history_are_durable()
    {
        using var f = new ApiFactory(Database);
        var a = await User(f, "Coach");
        var b = await User(f, "Client");
        await Ok(b.Http.PutAsJsonAsync("/api/v1/me/messaging-preferences", new { requireApproval = true }));
        Assert.Equal(HttpStatusCode.Forbidden, (await a.Http.PostAsJsonAsync(Root + "/conversations/direct", new
        {
            userId = b.Id
        })).StatusCode);
        var request = await Ok(a.Http.PostAsJsonAsync(Root + "/requests", new
        {
            userId = b.Id,
            body = "Hello"
        }));
        var rid = request.GetProperty("id").GetGuid();
        Assert.Equal(HttpStatusCode.NotFound, (await a.Http.PostAsync(Root + $"/requests/{rid}/accept", null)).StatusCode);
        var accepted = await Ok(b.Http.PostAsync(Root + $"/requests/{rid}/accept", null));
        var cid = accepted.GetProperty("conversationId").GetGuid();
        Assert.Equal(cid, (await Ok(b.Http.PostAsync(Root + $"/requests/{rid}/accept", null))).GetProperty("conversationId").GetGuid());
        var introduction = Assert.Single((await History(b.Http, cid)).GetProperty("items").EnumerateArray());
        Assert.Equal("Hello", introduction.GetProperty("body").GetString());
        Assert.Equal(a.Id, introduction.GetProperty("senderUserId").GetGuid());
        await Send(a.Http, cid, "persisted");
        Assert.Equal(HttpStatusCode.NoContent, (await b.Http.PostAsync($"/api/v1/me/blocked-users/{a.Id}", null)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await SendResponse(a.Http, cid, "blocked")).StatusCode);
        Assert.Equal(2, (await History(b.Http, cid)).GetProperty("items").GetArrayLength());
        Assert.Equal(HttpStatusCode.Forbidden, (await a.Http.PostAsJsonAsync(Root + "/requests", new
        {
            userId = b.Id,
            body = "again"
        })).StatusCode);
        using var reopened = new ApiFactory(Database);
        var http = reopened.CreateClient();
        http.DefaultRequestHeaders.Authorization = new("Bearer", reopened.Token(b.Id));
        Assert.Equal(2, (await History(http, cid)).GetProperty("items").GetArrayLength());
    }

    [CatalogPostgresFact]
    public async Task Declined_and_cancelled_requests_do_not_grant_direct_access()
    {
        using var f = new ApiFactory(Database);
        var a = await User(f, "Coach");
        var b = await User(f, "Client");
        await Ok(b.Http.PutAsJsonAsync("/api/v1/me/messaging-preferences", new { requireApproval = true }));
        var r = await Ok(a.Http.PostAsJsonAsync(Root + "/requests", new
        {
            userId = b.Id,
            body = "hi"
        }));
        var id = r.GetProperty("id").GetGuid();
        await Ok(b.Http.PostAsync(Root + $"/requests/{id}/decline", null));
        Assert.Equal(HttpStatusCode.Forbidden, (await SendResponse(a.Http, r.GetProperty("conversationId").GetGuid(), "Still denied")).StatusCode);
        var next = await Ok(a.Http.PostAsJsonAsync(Root + "/requests", new
        {
            userId = b.Id,
            body = "retry"
        }));
        await Ok(a.Http.PostAsync(Root + "/requests/" + next.GetProperty("id").GetGuid() + "/cancel", null));
        Assert.Equal(HttpStatusCode.Forbidden, (await SendResponse(a.Http, r.GetProperty("conversationId").GetGuid(), "Still denied")).StatusCode);
    }

    [CatalogPostgresFact]
    public async Task New_members_see_history_removed_members_have_exact_cutoff_and_rejoin_restores_history()
    {
        using var f = new ApiFactory(Database);
        var owner = await User(f, "Coach");
        var member = await User(f, "Client");
        var stranger = await User(f, "Coach");
        var id = await Group(owner.Http, []);
        var first = await Send(owner.Http, id, "before join");
        Assert.Equal(HttpStatusCode.NoContent, (await owner.Http.PostAsJsonAsync(Root + $"/conversations/{id}/members", new
        {
            userId = member.Id
        })).StatusCode);
        Assert.Single((await History(member.Http, id)).GetProperty("items").EnumerateArray());
        Assert.Equal(HttpStatusCode.NoContent, (await owner.Http.DeleteAsync(Root + $"/conversations/{id}/members/{member.Id}")).StatusCode);
        var future = await Send(owner.Http, id, "after removal");
        Assert.Equal(HttpStatusCode.NoContent, (await owner.Http.PostAsync(Root + $"/conversations/{id}/members/{member.Id}/ban", null)).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await owner.Http.DeleteAsync(Root + $"/conversations/{id}/members/{member.Id}")).StatusCode);
        var history = await History(member.Http, id);
        Assert.Equal(first.GetProperty("id").GetGuid(), Assert.Single(history.GetProperty("items").EnumerateArray()).GetProperty("id").GetGuid());
        Assert.Equal(HttpStatusCode.Forbidden, (await SendResponse(member.Http, id, "denied")).StatusCode);
        Assert.Empty((await History(member.Http, id, after: first.GetProperty("cursor").GetString())).GetProperty("items").EnumerateArray());
        Assert.Equal(HttpStatusCode.NotFound, (await member.Http.PostAsJsonAsync(Root + $"/messages/{future.GetProperty("id").GetGuid()}/report", new
        {
            category = "abuse"
        })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await stranger.Http.GetAsync(Root + $"/conversations/{id}")).StatusCode);
        await owner.Http.PostAsJsonAsync(Root + $"/conversations/{id}/members/{member.Id}/unban", new
        {
        });
        Assert.Equal(HttpStatusCode.NoContent, (await owner.Http.PostAsJsonAsync(Root + $"/conversations/{id}/members", new
        {
            userId = member.Id
        })).StatusCode);
        Assert.Equal(2, (await History(member.Http, id)).GetProperty("items").GetArrayLength());
    }

    [CatalogPostgresFact]
    public async Task Linked_groups_sync_atomically_manual_members_survive_and_exclusions_win()
    {
        using var f = new ApiFactory(Database);
        var coach = await User(f, "Coach");
        var client = await User(f, "Client");
        var manual = await User(f, "Client");
        var rel = await Activate(f, coach.Id, client.Id);
        var g = await Ok(coach.Http.PostAsJsonAsync("/api/v1/coaching/groups", new
        {
            name = "linked",
            description = "",
            color = "#123456"
        }));
        var gid = g.GetProperty("id").GetGuid();
        var c = await Ok(coach.Http.PostAsync($"/api/v1/coaching/groups/{gid}/conversation", null));
        var cid = c.GetProperty("id").GetGuid();
        await Versioned(coach.Http, HttpMethod.Put, $"/api/v1/coaching/groups/{gid}/members/{rel}", 1);
        Assert.Equal(HttpStatusCode.OK, (await client.Http.GetAsync(Root + $"/conversations/{cid}")).StatusCode);
        await coach.Http.PostAsJsonAsync(Root + $"/conversations/{cid}/members", new
        {
            userId = manual.Id
        });
        await Send(coach.Http, cid, "before suspend");
        await Versioned(coach.Http, HttpMethod.Post, $"/api/v1/coaching/relationships/{rel}/suspend", 1);
        Assert.Equal(HttpStatusCode.Forbidden, (await SendResponse(client.Http, cid, "suspended")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await SendResponse(manual.Http, cid, "manual remains")).StatusCode);
        await Versioned(coach.Http, HttpMethod.Post, $"/api/v1/coaching/relationships/{rel}/resume", 2);
        Assert.Equal(HttpStatusCode.OK, (await SendResponse(client.Http, cid, "resumed")).StatusCode);
        await coach.Http.PostAsync(Root + $"/conversations/{cid}/members/{client.Id}/ban", null);
        await Versioned(coach.Http, HttpMethod.Delete, $"/api/v1/coaching/groups/{gid}/members/{rel}", 2);
        await Versioned(coach.Http, HttpMethod.Put, $"/api/v1/coaching/groups/{gid}/members/{rel}", 3);
        Assert.Equal(HttpStatusCode.Forbidden, (await SendResponse(client.Http, cid, "ban wins")).StatusCode);
        await coach.Http.PostAsync(Root + $"/conversations/{cid}/members/{client.Id}/unban", null);
        await Versioned(coach.Http, HttpMethod.Post, $"/api/v1/coaching/relationships/{rel}/suspend", 3);
        await Versioned(coach.Http, HttpMethod.Post, $"/api/v1/coaching/relationships/{rel}/resume", 4);
        Assert.Equal(HttpStatusCode.OK, (await SendResponse(client.Http, cid, "eligible again")).StatusCode);
        await Versioned(coach.Http, HttpMethod.Post, $"/api/v1/coaching/relationships/{rel}/complete", 5);
        Assert.Equal(HttpStatusCode.Forbidden, (await SendResponse(client.Http, cid, "completed")).StatusCode);
        Assert.True((await History(client.Http, cid)).GetProperty("items").GetArrayLength() > 0);
    }

    [CatalogPostgresFact]
    public async Task Message_idempotency_reply_validation_cursor_ties_and_read_highwater()
    {
        using var f = new ApiFactory(Database);
        var a = await User(f, "Coach");
        var b = await User(f, "Client");
        var id = await Group(a.Http, [b.Id]);
        var other = await Group(a.Http, []);
        var key = Guid.NewGuid().ToString();
        var responses = await Task.WhenAll(Enumerable.Range(0, 10).Select(_ => SendResponse(a.Http, id, "once", key)));
        var ids = new List<Guid>();
        foreach (var r in responses)
        {
            Assert.Equal(HttpStatusCode.OK, r.StatusCode);
            var message = await Json(r);
            Assert.Equal(key, message.GetProperty("clientMessageId").GetString());
            ids.Add(message.GetProperty("id").GetGuid());
        }

        Assert.Single(ids.Distinct());
        Assert.Equal(HttpStatusCode.Conflict, (await SendResponse(a.Http, id, "different", key)).StatusCode);
        var foreign = await Send(a.Http, other, "other");
        Assert.Equal(HttpStatusCode.BadRequest, (await SendResponse(a.Http, id, "reply", reply: foreign.GetProperty("id").GetGuid())).StatusCode);
        await Send(a.Http, id, "reply", reply: ids[0]);
        var third = await Send(a.Http, id, "third");
        using (var db = Db())
        {
            var timestamp = new DateTimeOffset(2026, 1, 1, 0, 0, 0, TimeSpan.Zero);
            await db.Messages.Where(x => x.ConversationId == id).ExecuteUpdateAsync(s => s.SetProperty(x => x.CreatedAt, timestamp));
        }

        var latest = await History(b.Http, id, limit: 2);
        var page = latest.GetProperty("items").EnumerateArray().ToArray();
        var older = await History(b.Http, id, before: latest.GetProperty("olderCursor").GetString(), limit: 2);
        Assert.Single(older.GetProperty("items").EnumerateArray());
        Assert.Empty(page.Select(x => x.GetProperty("id").GetGuid()).Intersect(older.GetProperty("items").EnumerateArray().Select(x => x.GetProperty("id").GetGuid())));
        var listed = await Ok(b.Http.GetAsync(Root + "/conversations"));
        Assert.Equal(3, listed.EnumerateArray().Single(x => x.GetProperty("id").GetGuid() == id).GetProperty("unreadCount").GetInt64());
        await b.Http.PostAsJsonAsync(Root + $"/conversations/{id}/read", new
        {
            messageId = third.GetProperty("id").GetGuid()
        });
        await b.Http.PostAsJsonAsync(Root + $"/conversations/{id}/read", new
        {
            messageId = ids[0]
        });
        Assert.Equal(0, (await Ok(b.Http.GetAsync(Root + "/conversations"))).EnumerateArray().Single(x => x.GetProperty("id").GetGuid() == id).GetProperty("unreadCount").GetInt64());
        Assert.Equal(HttpStatusCode.BadRequest, (await a.Http.GetAsync(Root + $"/conversations/{other}/messages?after=" + Uri.EscapeDataString(page[0].GetProperty("cursor").GetString()!))).StatusCode);
    }

    [CatalogPostgresFact]
    public async Task Reports_keep_immutable_evidence_and_blocking_affects_only_direct_chat()
    {
        using var f = new ApiFactory(Database);
        var a = await User(f, "Coach");
        var b = await User(f, "Client");
        var outsider = await User(f, "Coach");
        var id = await Group(a.Http, [b.Id]);
        var message = await Send(a.Http, id, "evidence");
        var mid = message.GetProperty("id").GetGuid();
        var report = await Ok(b.Http.PostAsJsonAsync(Root + $"/messages/{mid}/report", new
        {
            category = "harassment",
            details = "context"
        }));
        await b.Http.PostAsync($"/api/v1/me/blocked-users/{a.Id}", null);
        Assert.Equal(HttpStatusCode.OK, (await SendResponse(b.Http, id, "group allowed")).StatusCode);
        await a.Http.DeleteAsync(Root + $"/conversations/{id}/members/{b.Id}");
        using var db = Db();
        var stored = await db.Reports.SingleAsync(x => x.Id == report.GetProperty("reportId").GetGuid());
        Assert.Contains("evidence", stored.Evidence);
        Assert.Equal(HttpStatusCode.NotFound, (await outsider.Http.PostAsJsonAsync(Root + $"/messages/{mid}/report", new
        {
            category = "abuse"
        })).StatusCode);
    }

    [CatalogPostgresFact]
    public async Task Attachments_are_owned_private_typed_and_idempotent_with_removed_member_cutoffs()
    {
        using var f = new ApiFactory(Database);
        var files = new TestMediaLibrary();
        using var configured = f.WithWebHostBuilder(b => b.ConfigureServices(s => s.Replace(ServiceDescriptor.Singleton<IMediaLibrary>(files))));
        var a = await User(f, "Coach", configured.CreateClient);
        var b = await User(f, "Client", configured.CreateClient);
        var stranger = await User(f, "Client", configured.CreateClient);
        var id = await Group(a.Http, [b.Id]);
        foreach (var (type, mime, duration) in new[]
        {
            ("Image", "image/png", (long? )null),
            ("File", "application/pdf", (long? )null),
            ("Video", "video/mp4", (long? )null),
            ("VoiceMessage", "audio/wav", (long? )1000)
        }

        )
        {
            var file = files.Add(a.Id, mime, duration);
            var key = Guid.NewGuid().ToString();
            async Task<HttpResponseMessage> Post(Guid fileId)
            {
                var r = new HttpRequestMessage(HttpMethod.Post, Root + $"/conversations/{id}/messages")
                {
                    Content = JsonContent.Create(new { type, body = (string?)null, mediaIds = new[] { fileId } })
                };
                r.Headers.Add("Idempotency-Key", key);
                return await a.Http.SendAsync(r);
            }

            var created = await Ok(Post(file));
            var retry = await Ok(Post(file));
            var mid = created.GetProperty("id").GetGuid();
            Assert.Equal(mid, retry.GetProperty("id").GetGuid());
            var attachment = Assert.Single(created.GetProperty("attachments").EnumerateArray());
            Assert.Equal(mime, attachment.GetProperty("contentType").GetString());
            Assert.False(attachment.TryGetProperty("objectKey", out _));
            var url = Root + $"/messages/{mid}/attachments/{file}";
            var downloaded = await b.Http.GetAsync(url);
            Assert.Equal(HttpStatusCode.OK, downloaded.StatusCode);
            Assert.Equal("attachment", downloaded.Content.Headers.ContentDisposition?.DispositionType);
            Assert.Equal(HttpStatusCode.NotFound, (await stranger.Http.GetAsync(url)).StatusCode);
            using var db = Db();
            Assert.Equal(1, await db.Attachments.CountAsync(x => x.MessageId == mid));
            Assert.Equal(1, files.Pins[file]);
            var deleted = await Ok(a.Http.DeleteAsync(Root + $"/messages/{mid}"));
            Assert.Empty(deleted.GetProperty("attachments").EnumerateArray());
            Assert.Equal(HttpStatusCode.NotFound, (await b.Http.GetAsync(url)).StatusCode);
            Assert.Equal(HttpStatusCode.NotFound, (await a.Http.GetAsync(url)).StatusCode);
        }

        var foreign = files.Add(b.Id, "image/png", null);
        var request = new HttpRequestMessage(HttpMethod.Post, Root + $"/conversations/{id}/messages")
        {
            Content = JsonContent.Create(new { type = "Image", mediaIds = new[] { foreign } })
        };
        request.Headers.Add("Idempotency-Key", Guid.NewGuid().ToString());
        Assert.Equal(HttpStatusCode.NotFound, (await a.Http.SendAsync(request)).StatusCode);
        await a.Http.DeleteAsync(Root + $"/conversations/{id}/members/{b.Id}");
        var future = files.Add(a.Id, "image/png", null);
        var futureRequest = new HttpRequestMessage(HttpMethod.Post, Root + $"/conversations/{id}/messages")
        {
            Content = JsonContent.Create(new { type = "Image", mediaIds = new[] { future } })
        };
        futureRequest.Headers.Add("Idempotency-Key", Guid.NewGuid().ToString());
        var futureMessage = await Ok(a.Http.SendAsync(futureRequest));
        Assert.Equal(HttpStatusCode.NotFound, (await b.Http.GetAsync(Root + $"/messages/{futureMessage.GetProperty("id").GetGuid()}/attachments/{future}")).StatusCode);
    }

    [CatalogPostgresFact]
    public async Task Realtime_observes_committed_messages_failure_is_harmless_and_removed_recipients_are_revoked()
    {
        using var f = new ApiFactory(Database);
        var realtime = new TestHubContext();
        using var configured = f.WithWebHostBuilder(b => b.ConfigureServices(s => s.Replace(ServiceDescriptor.Singleton<IHubContext<MessagingHub>>(realtime))));
        var a = await User(f, "Coach", configured.CreateClient);
        var b = await User(f, "Client", configured.CreateClient);
        var id = await Group(a.Http, [b.Id]);
        var first = await Send(a.Http, id, "committed before notification");
        Assert.Contains(b.Id.ToString(), realtime.LastUsers);
        Assert.True(realtime.SawCommittedMessage);
        realtime.Throw = true;
        await Send(a.Http, id, "survives realtime failure");
        Assert.Equal(2, (await History(b.Http, id)).GetProperty("items").GetArrayLength());
        realtime.Throw = false;
        await a.Http.DeleteAsync(Root + $"/conversations/{id}/members/{b.Id}");
        await Send(a.Http, id, "future delivery revoked");
        Assert.DoesNotContain(b.Id.ToString(), realtime.LastUsers);
        Assert.Equal(2, (await History(b.Http, id)).GetProperty("items").GetArrayLength());
        var caughtUp = await History(a.Http, id, after: first.GetProperty("cursor").GetString());
        Assert.Equal(2, caughtUp.GetProperty("items").GetArrayLength());
    }

    [CatalogPostgresFact]
    public async Task Nested_transaction_callbacks_wait_for_outer_commit_and_are_discarded_on_rollback()
    {
        await using var data = Npgsql.NpgsqlDataSource.Create(Database);
        await using var tx = new ModuleTransaction(data);
        var calls = 0;
        await tx.RunAsync(async ct =>
        {
            await tx.RunAsync(inner =>
            {
                tx.OnCommitted(token =>
                {
                    Assert.False(tx.IsActive);
                    calls++;
                    return Task.CompletedTask;
                });
                return Task.CompletedTask;
            }, ct);
            Assert.Equal(0, calls);
        }, default);
        Assert.Equal(1, calls);
        await Assert.ThrowsAsync<InvalidOperationException>(() => tx.RunAsync(ct =>
        {
            tx.OnCommitted(_ =>
            {
                calls++;
                return Task.CompletedTask;
            });
            throw new InvalidOperationException("rollback");
        }, default));
        await tx.RunAsync(_ => Task.CompletedTask, default);
        Assert.Equal(1, calls);
    }

    [CatalogPostgresFact]
    public async Task SignalR_typing_is_ephemeral_authenticated_and_current_membership_is_rechecked()
    {
        using var f = new ApiFactory(Database);
        var realtime = new TestHubContext();
        using var configured = f.WithWebHostBuilder(b => b.ConfigureServices(s => s.Replace(ServiceDescriptor.Singleton<IHubContext<MessagingHub>>(realtime))));
        var a = await User(f, "Coach", configured.CreateClient);
        var b = await User(f, "Client", configured.CreateClient);
        var id = await Group(a.Http, [b.Id]);
        var client = configured.Server.CreateWebSocketClient();
        using var socket = await client.ConnectAsync(new Uri("ws://localhost/api/v1/messaging/hub?access_token=" + Uri.EscapeDataString(f.Token(b.Id))), default);
        async Task SendFrame(object frame)
        {
            var bytes = System.Text.Encoding.UTF8.GetBytes(JsonSerializer.Serialize(frame) + "\u001e");
            await socket.SendAsync(bytes, System.Net.WebSockets.WebSocketMessageType.Text, true, default);
        }

        async Task<string> ReceiveFrame()
        {
            var buffer = new byte[8192];
            using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(5));
            var result = await socket.ReceiveAsync(buffer, timeout.Token);
            return System.Text.Encoding.UTF8.GetString(buffer, 0, result.Count);
        }

        await SendFrame(new
        {
            protocol = "json",
            version = 1
        });
        Assert.Contains("{}", await ReceiveFrame());
        await SendFrame(new
        {
            type = 1,
            invocationId = "1",
            target = "Typing",
            arguments = new object[] { id, true }
        });
        var first = await ReceiveFrame();
        Assert.DoesNotContain("error", first);
        Assert.Equal("TypingChanged", realtime.LastEvent);
        using (var db = Db())
            Assert.Equal(0, await db.Messages.CountAsync(x => x.ConversationId == id));
        await a.Http.DeleteAsync(Root + $"/conversations/{id}/members/{b.Id}");
        realtime.LastEvent = "";
        await SendFrame(new
        {
            type = 1,
            invocationId = "2",
            target = "Typing",
            arguments = new object[] { id, true }
        });
        Assert.Contains("error", await ReceiveFrame());
        Assert.Equal("", realtime.LastEvent);
    }

    [CatalogPostgresFact]
    public async Task Group_sync_rolls_back_with_coaching_and_concurrent_ban_always_wins()
    {
        using var f = new ApiFactory(Database);
        var observer = new FailingObserver();
        using var configured = f.WithWebHostBuilder(b => b.ConfigureServices(s => s.AddSingleton<ICoachingMessagingObserver>(observer)));
        var a = await User(f, "Coach", configured.CreateClient);
        var b = await User(f, "Client", configured.CreateClient);
        var rel = await Activate(f, a.Id, b.Id);
        var group = await Ok(a.Http.PostAsJsonAsync("/api/v1/coaching/groups", new
        {
            name = "atomic",
            description = "",
            color = "#123456"
        }));
        var gid = group.GetProperty("id").GetGuid();
        await Versioned(a.Http, HttpMethod.Put, $"/api/v1/coaching/groups/{gid}/members/{rel}", 1);
        var linked = await Ok(a.Http.PostAsync($"/api/v1/coaching/groups/{gid}/conversation", null));
        var cid = linked.GetProperty("id").GetGuid();
        observer.Fail = true;
        var removal = new HttpRequestMessage(HttpMethod.Delete, $"/api/v1/coaching/groups/{gid}/members/{rel}");
        removal.Headers.Add("If-Match", "\"2\"");
        Assert.Equal(HttpStatusCode.BadRequest, (await a.Http.SendAsync(removal)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await SendResponse(b.Http, cid, "rollback preserved eligibility")).StatusCode);
        var after = await Ok(a.Http.GetAsync($"/api/v1/coaching/groups/{gid}"));
        Assert.Equal(2, after.GetProperty("version").GetInt64());
        observer.Fail = false;
        await Versioned(a.Http, HttpMethod.Delete, $"/api/v1/coaching/groups/{gid}/members/{rel}", 2);
        await Task.WhenAll(Versioned(a.Http, HttpMethod.Put, $"/api/v1/coaching/groups/{gid}/members/{rel}", 3), a.Http.PostAsync(Root + $"/conversations/{cid}/members/{b.Id}/ban", null));
        Assert.Equal(HttpStatusCode.Forbidden, (await SendResponse(b.Http, cid, "ban beats sync")).StatusCode);
        using var db = Db();
        var member = await db.Members.SingleAsync(x => x.ConversationId == cid && x.UserId == b.Id);
        Assert.Equal(MemberState.Banned, member.State);
        Assert.True(member.Excluded);
    }

    private sealed class FailingObserver : ICoachingMessagingObserver
    {
        public bool Fail
        {
            get; set;
        }

        public Task GroupChangedAsync(MessagingClientGroup group, CancellationToken ct)
        {
            if (Fail)
                throw ApiException.Invalid("Simulated sync failure");
            return Task.CompletedTask;
        }
    }

    [CatalogPostgresFact]
    public async Task Realtime_and_api_recheck_revoked_capabilities_without_trusting_metadata()
    {
        using var f = new ApiFactory(Database);
        var realtime = new TestHubContext();
        using var configured = f.WithWebHostBuilder(b => b.ConfigureServices(s => s.Replace(ServiceDescriptor.Singleton<IHubContext<MessagingHub>>(realtime))));
        var a = await User(f, "Coach", configured.CreateClient);
        var b = await User(f, "Client", configured.CreateClient);
        var id = await Group(a.Http, [b.Id]);
        await Send(a.Http, id, "before feature revocation");
        Assert.Contains(b.Id.ToString(), realtime.LastUsers);
        using (var accessDb = new AccessDbContext(new DbContextOptionsBuilder<AccessDbContext>().UseNpgsql(Database).Options))
        {
            accessDb.Overrides.Add(new FeatureOverride { UserId = b.Id, Key = "messaging.groups", Granted = false });
            await accessDb.SaveChangesAsync();
        }

        await Send(a.Http, id, "after feature revocation");
        Assert.DoesNotContain(b.Id.ToString(), realtime.LastUsers);
        b.Http.DefaultRequestHeaders.Authorization = new("Bearer", f.Token(b.Id, metadataAdmin: true));
        Assert.Equal(HttpStatusCode.Forbidden, (await b.Http.GetAsync(Root + $"/conversations/{id}/messages")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await SendResponse(b.Http, id, "metadata cannot bypass")).StatusCode);
        Assert.Empty((await Ok(b.Http.GetAsync(Root + "/conversations"))).EnumerateArray());
    }

    [CatalogPostgresFact]
    public async Task Groups_only_entitlement_can_create_send_and_read_without_direct_feature()
    {
        using var f = new ApiFactory(Database);
        var user = await User(f, "Coach");
        using (var accessDb = new AccessDbContext(new DbContextOptionsBuilder<AccessDbContext>().UseNpgsql(Database).Options))
        {
            accessDb.Overrides.Add(new FeatureOverride { UserId = user.Id, Key = "messaging.direct", Granted = false });
            await accessDb.SaveChangesAsync();
        }

        var id = await Group(user.Http, []);
        await Send(user.Http, id, "groups remain available");
        Assert.Single((await History(user.Http, id)).GetProperty("items").EnumerateArray());
        Assert.Equal(HttpStatusCode.OK, (await user.Http.GetAsync(Root + $"/conversations/{id}/members")).StatusCode);
        Assert.Single((await Ok(user.Http.GetAsync(Root + "/conversations"))).EnumerateArray());
    }

    [CatalogPostgresFact]
    public async Task Server_timestamps_advance_when_clock_is_frozen_and_catchup_cannot_skip_new_messages()
    {
        using var f = new ApiFactory(Database);
        using var configured = f.WithWebHostBuilder(b => b.ConfigureServices(s => s.Replace(ServiceDescriptor.Singleton<TimeProvider>(new FrozenClock()))));
        var user = await User(f, "Coach", configured.CreateClient);
        var id = await Group(user.Http, []);
        var first = await Send(user.Http, id, "first instant");
        Assert.Equal(HttpStatusCode.NoContent, (await user.Http.PatchAsJsonAsync(Root + $"/conversations/{id}", new
        {
            title = "Renamed with frozen clock"
        })).StatusCode);
        var second = await Send(user.Http, id, "same clock instant");
        Assert.True(second.GetProperty("createdAt").GetDateTimeOffset() > first.GetProperty("createdAt").GetDateTimeOffset());
        var catchup = await History(user.Http, id, after: first.GetProperty("cursor").GetString());
        Assert.Equal(second.GetProperty("id").GetGuid(), Assert.Single(catchup.GetProperty("items").EnumerateArray()).GetProperty("id").GetGuid());
    }

    private sealed class FrozenClock : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => new(2026, 10, 7, 0, 0, 0, TimeSpan.Zero);
    }

    private sealed class TestMediaLibrary : IMediaLibrary
    {
        private readonly Dictionary<Guid, ReadyMedia> files = [];
        public Dictionary<Guid, int> Pins { get; } = [];

        public Guid Add(Guid owner, string mime, long? duration)
        {
            var id = Guid.NewGuid();
            files[id] = new(id, owner, "private", "secret/object/path", mime, 20, duration);
            return id;
        }

        public Task<ReadyMedia> RequireReadyAsync(Guid id, Guid owner, CancellationToken ct) => Task.FromResult(files.TryGetValue(id, out var file) && file.OwnerId == owner ? file : throw ApiException.NotFound());
        public async Task PinAsync(Guid id, Guid owner, CancellationToken ct)
        {
            await RequireReadyAsync(id, owner, ct);
            Pins[id] = Pins.GetValueOrDefault(id) + 1;
        }

        public async Task<Stream> OpenReadAsync(Guid id, Guid owner, CancellationToken ct)
        {
            await RequireReadyAsync(id, owner, ct);
            return new MemoryStream(new byte[20]);
        }
    }

    private sealed class TestHubContext : IHubContext<MessagingHub>, IHubClients, IClientProxy
    {
        IHubClients IHubContext<MessagingHub>.Clients => this;

        IGroupManager IHubContext<MessagingHub>.Groups => throw new NotSupportedException();
        public IClientProxy All => this;
        public string[] LastUsers { get; private set; } = [];
        public bool Throw
        {
            get; set;
        }
        public bool SawCommittedMessage
        {
            get; private set;
        }
        public string LastEvent { get; set; } = "";
        public List<RequestDto> RequestEvents { get; } = [];

        public IClientProxy AllExcept(IReadOnlyList<string> ids) => this;
        public IClientProxy Client(string id) => this;
        public IClientProxy Clients(IReadOnlyList<string> ids) => this;
        public IClientProxy Group(string id) => this;
        public IClientProxy GroupExcept(string id, IReadOnlyList<string> ids) => this;
        public IClientProxy Groups(IReadOnlyList<string> ids) => this;
        public IClientProxy User(string id)
        {
            LastUsers = [id];
            return this;
        }

        public IClientProxy Users(IReadOnlyList<string> ids)
        {
            LastUsers = ids.ToArray();
            return this;
        }

        public async Task SendCoreAsync(string method, object?[] args, CancellationToken ct = default)
        {
            LastEvent = method;
            if (args[0] is RequestDto request) RequestEvents.Add(request);
            if (method == "MessageCreated" && args[0] is TrainFlow.Messaging.Features.MessageDto dto)
            {
                using var db = Db();
                SawCommittedMessage = await db.Messages.AnyAsync(x => x.Id == dto.Id, ct);
                Assert.True(SawCommittedMessage);
            }

            if (Throw)
                throw new IOException("Simulated unavailable realtime transport");
        }
    }

    private static async Task<(Guid Id, HttpClient Http)> User(ApiFactory f, string role, Func<HttpClient>? createClient = null)
    {
        var id = Guid.NewGuid();
        var http = createClient?.Invoke() ?? f.CreateClient();
        http.DefaultRequestHeaders.Authorization = new("Bearer", f.Token(id));
        await Ok(http.PutAsJsonAsync("/api/v1/me/onboarding", new
        {
            username = $"m{id:N}"[..30],
            displayName = "Messaging " + role,
            birthDate = "1990-01-01",
            acceptedTerms = true,
            locale = "en",
            timeZone = "UTC",
            role
        }));
        return (id, http);
    }

    private static async Task<Guid> Activate(ApiFactory f, Guid a, Guid b)
    {
        using var scope = f.Services.CreateScope();
        return await scope.ServiceProvider.GetRequiredService<IRelationshipActivation>().ActivateDevFixtureAsync(a, b, default);
    }

    private static async Task<Guid> Group(HttpClient http, Guid[] users) => (await Ok(http.PostAsJsonAsync(Root + "/conversations/group", new { title = "Test group", userIds = users }))).GetProperty("id").GetGuid();
    private static Task<JsonElement> Send(HttpClient h, Guid id, string body, string? key = null, Guid? reply = null) => Ok(SendResponse(h, id, body, key, reply));
    private static Task<HttpResponseMessage> SendResponse(HttpClient h, Guid id, string body, string? key = null, Guid? reply = null)
    {
        var r = new HttpRequestMessage(HttpMethod.Post, Root + $"/conversations/{id}/messages")
        {
            Content = JsonContent.Create(new { type = "Text", body, replyToMessageId = reply, mediaIds = Array.Empty<Guid>() })
        };
        r.Headers.Add("Idempotency-Key", key ?? Guid.NewGuid().ToString());
        return h.SendAsync(r);
    }

    private static Task<JsonElement> History(HttpClient h, Guid id, string? before = null, string? after = null, int limit = 50) => Ok(h.GetAsync(Root + $"/conversations/{id}/messages?limit={limit}" + (before == null ? "" : "&before=" + Uri.EscapeDataString(before)) + (after == null ? "" : "&after=" + Uri.EscapeDataString(after))));
    private static async Task<JsonElement> Ok(Task<HttpResponseMessage> task)
    {
        var response = await task;
        Assert.True(response.StatusCode == HttpStatusCode.OK, await response.Content.ReadAsStringAsync());
        return await Json(response);
    }

    private static Task<JsonElement> Json(HttpResponseMessage r) => r.Content.ReadFromJsonAsync<JsonElement>();
    private static async Task Versioned(HttpClient h, HttpMethod method, string path, long version)
    {
        var r = new HttpRequestMessage(method, path)
        {
            Content = JsonContent.Create(new { })
        };
        r.Headers.Add("If-Match", $"\"{version}\"");
        var response = await h.SendAsync(r);
        Assert.True(response.StatusCode == HttpStatusCode.OK, await response.Content.ReadAsStringAsync());
    }
}
