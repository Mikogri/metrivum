using System.Net.Http.Headers;
using System.Security.Claims;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Metrivum.BuildingBlocks;
using Metrivum.Coaching.Contracts;
using Metrivum.Coaching.Infrastructure;
using Metrivum.Media;
using Metrivum.Messaging.Domain;
using Metrivum.Messaging.Features;
using Metrivum.Messaging.Infrastructure;

internal static class StageThreeMessagingFixture
{
    public static async Task RunAsync(IServiceProvider root, Guid[] ids, Guid? userE, IConfiguration configuration)
    {
        async Task<T> As<T>(Guid actor, Func<IServiceProvider, Task<T>> action)
        {
            await using var scope = root.CreateAsyncScope();
            scope.ServiceProvider.GetRequiredService<IHttpContextAccessor>().HttpContext = new DefaultHttpContext
            {
                User = new ClaimsPrincipal(new ClaimsIdentity([new Claim("sub", actor.ToString())], "DevFixtureConsole"))
            };
            return await action(scope.ServiceProvider);
        }

        var result = await As(ids[0], async services =>
        {
            var chat = services.GetRequiredService<MessagingService>();
            var direct = await chat.DirectAsync(ids[2], default);
            var text = await chat.SendAsync(direct.Id, new(MessageType.Text, "Stage 3A persistent direct message", null, []), "devfixture:3a:direct:text:v1", default);
            await chat.SendAsync(direct.Id, new(MessageType.Text, "Stage 3A reply", text.Id, []), "devfixture:3a:direct:reply:v1", default);
            var coaching = services.GetRequiredService<CoachingDbContext>();
            var group = await coaching.Groups.AsNoTracking().SingleAsync(x => x.CoachId == ids[0] && x.Name == "DevFixture Group A1");
            var linked = await chat.LinkAsync(group.Id, true, default);
            if (!linked.Members.Any(x => x.UserId == ids[1] && x.State == MemberState.Active && x.Source == MemberSource.Manual))
                await chat.MemberAsync(linked.Id, ids[1], "add", default);
            if (!linked.Members.Any(x => x.UserId == ids[3] && x.State == MemberState.Banned))
                await chat.MemberAsync(linked.Id, ids[3], "ban", default);
            await chat.SendAsync(linked.Id, new(MessageType.Text, "Linked group: manual Coach B stays; Client D is explicitly banned", null, []), "devfixture:3a:linked:text:v1", default);
            foreach (var (prefix, type) in new[]
            {
                ("image", MessageType.Image), ("file", MessageType.File),
                ("video", MessageType.Video), ("voice", MessageType.VoiceMessage)
            })
            {
                var mediaKey = prefix + "-media";
                var fileKey = prefix + "-file";
                if (configuration[mediaKey] is { } supplied)
                {
                    if (configuration[fileKey] is not null)
                        throw new InvalidOperationException($"Supply either --{mediaKey} or --{fileKey}.");
                    if (!Guid.TryParse(supplied, out var mediaId) || mediaId == Guid.Empty)
                        throw new InvalidOperationException($"--{mediaKey} must be a ready Media ID owned by Coach A.");
                    await chat.SendAsync(direct.Id, new(type, null, null, [mediaId]), $"devfixture:3a:{mediaKey}:{mediaId}", default);
                    continue;
                }
                if (configuration[fileKey] is not { } path)
                {
                    Console.WriteLine($"Attachment {type} not seeded: supply --{mediaKey} or --{fileKey}.");
                    continue;
                }

                var messageKey = $"devfixture:3a:{fileKey}:v1";
                var messaging = services.GetRequiredService<MessagingDbContext>();
                // Reuse the durable fixture message before requesting another upload capability.
                if (await messaging.Messages.AsNoTracking().AnyAsync(x => x.ConversationId == direct.Id && x.SenderUserId == ids[0] && x.IdempotencyKey == messageKey))
                    continue;
                var source = new FileInfo(Path.GetFullPath(path));
                if (!source.Exists)
                    throw new InvalidOperationException($"The file supplied through --{fileKey} does not exist.");
                var contentType = ContentType(source.Extension, type);
                var media = services.GetRequiredService<MediaLibrary>();
                var ticket = await media.CreateMessagingAsync(ids[0], new(source.Name, contentType, source.Length), default);
                using var http = new HttpClient { Timeout = TimeSpan.FromMinutes(2) };
                await using var stream = source.OpenRead();
                using var content = new StreamContent(stream);
                content.Headers.ContentType = new MediaTypeHeaderValue(contentType);
                using var response = await http.PutAsync(ticket.UploadUrl, content);
                if (!response.IsSuccessStatusCode)
                    throw new InvalidOperationException($"Private fixture upload failed with HTTP {(int)response.StatusCode}.");
                await media.FinalizeMessagingAsync(ticket.File.Id, ids[0], default);
                await chat.SendAsync(direct.Id, new(type, null, null, [ticket.File.Id]), messageKey, default);
            }
            return (DirectId: direct.Id, TextId: text.Id, LinkedId: linked.Id);
        });

        await As(ids[2], async services =>
        {
            var chat = services.GetRequiredService<MessagingService>();
            var history = await chat.HistoryAsync(result.DirectId, null, null, 100, default);
            if (!history.Items.Any(x => x.Id == result.TextId) || !history.Items.Any(x => x.ReplyToMessageId == result.TextId))
                throw new InvalidOperationException("Persistent fixture text/reply history is missing.");
            foreach (var message in history.Items)
                foreach (var attachment in message.Attachments)
                {
                    var file = await chat.AttachmentAsync(message.Id, attachment.MediaId, default);
                    await using var stream = file.Stream;
                    await stream.CopyToAsync(Stream.Null);
                }
            var before = await chat.GetAsync(result.DirectId, default);
            var newest = history.Items.OrderByDescending(x => x.CreatedAt).ThenByDescending(x => x.Id).First();
            await chat.ReadAsync(result.DirectId, newest.Id, default);
            var after = await chat.GetAsync(result.DirectId, default);
            if (after.UnreadCount != 0)
                throw new InvalidOperationException("The fixture read high-water marker did not clear unread messages.");
            Console.WriteLine($"Persistent history verified: {history.Items.Length} messages; unread {before.UnreadCount} -> {after.UnreadCount}; attachment downloads authorized for Client C.");
            return true;
        });
        await As(ids[1], async services =>
        {
            try
            {
                await services.GetRequiredService<MessagingService>().GetAsync(result.DirectId, default);
            }
            catch (ApiException ex) when (ex.Status == 404)
            {
                Console.WriteLine("Coach B cannot read Coach A/Client C direct history.");
                return true;
            }
            throw new InvalidOperationException("The fixture foreign-coach authorization check failed.");
        });
        if (userE.HasValue)
        {
            await As(userE.Value, async services =>
            {
                if (await services.GetRequiredService<ICoachingMessagingDirectory>().IsActivePairAsync(userE.Value, ids[0], default))
                    throw new InvalidOperationException("User E must not have an active relationship with Coach A for the request fixture.");
                var chat = services.GetRequiredService<MessagingService>();
                if (!(await chat.RequestsAsync(default)).Any(x => x.RecipientUserId == ids[0]))
                    await chat.RequestAsync(new(ids[0], "Stage 3A test contact request"), default);
                try
                {
                    await chat.DirectAsync(ids[0], default);
                }
                catch (ApiException ex) when (ex.Code == "MESSAGE_REQUEST_REQUIRED")
                {
                    Console.WriteLine("User E has a persistent contact request and cannot bypass acceptance into a direct chat.");
                    return true;
                }
                throw new InvalidOperationException("User E must have an unaccepted request and no existing direct conversation for this fixture.");
            });
        }
        else
            Console.WriteLine("Contact request not seeded: supply optional --user-e with a fifth distinct onboarded test account.");
        Console.WriteLine($"Stage 3A ready: direct {result.DirectId}; linked group {result.LinkedId}; text/reply/read marker/manual member/ban persisted. Re-run this separate process to verify persistence without duplicate fixture messages or uploads.");
    }

    private static string ContentType(string extension, MessageType type)
    {
        var mime = extension.ToLowerInvariant() switch
        {
            ".png" => "image/png",
            ".jpg" or ".jpeg" => "image/jpeg",
            ".gif" => "image/gif",
            ".webp" => "image/webp",
            ".pdf" => "application/pdf",
            ".txt" => "text/plain",
            ".zip" => "application/zip",
            ".mp4" => "video/mp4",
            ".webm" => "video/webm",
            ".wav" => "audio/wav",
            _ => throw new InvalidOperationException("Fixture file extension is not supported by Messaging Media validation.")
        };
        if ((type == MessageType.Image && !mime.StartsWith("image/", StringComparison.Ordinal)) ||
            (type == MessageType.Video && !mime.StartsWith("video/", StringComparison.Ordinal)) ||
            (type == MessageType.VoiceMessage && mime != "audio/wav"))
            throw new InvalidOperationException("Fixture file type does not match its message option.");
        return mime;
    }
}
