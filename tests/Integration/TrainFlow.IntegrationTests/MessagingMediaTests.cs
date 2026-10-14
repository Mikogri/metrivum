using System.Text;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Npgsql;
using TrainFlow.BuildingBlocks;
using TrainFlow.Media;
using TrainFlow.Media.Infrastructure;

namespace TrainFlow.IntegrationTests;

public sealed class MessagingMediaTests
{
    [MediaPostgresFact]
    public async Task Private_attachments_validate_bytes_ownership_duration_and_retention()
    {
        var connection = new NpgsqlConnectionStringBuilder(Environment.GetEnvironmentVariable("TRAINFLOW_TEST_DATABASE"));
        Assert.Contains(connection.Host, new[] { "127.0.0.1", "localhost", "::1" });
        var databaseName = "tf_messaging_media_" + Guid.NewGuid().ToString("N");
        await using var admin = NpgsqlDataSource.Create(connection.ConnectionString);
        await using (var create = admin.CreateCommand($"CREATE DATABASE {databaseName}"))
            await create.ExecuteNonQueryAsync();
        connection.Database = databaseName;
        connection.Pooling = false;
        try
        {
            await using var db = new MediaDbContext(new DbContextOptionsBuilder<MediaDbContext>().UseNpgsql(connection.ConnectionString, x => x.MigrationsHistoryTable("__EFMigrationsHistory", "media")).Options);
            await db.Database.MigrateAsync();
            var storage = new PrivateStorage();
            var media = new MediaLibrary(db, storage, Options.Create(new StorageOptions { Bucket = "private-test" }));
            var owner = Guid.NewGuid();
            var other = Guid.NewGuid();
            var files = new (string Mime, byte[] Bytes)[]
            {
                ("image/png", [137,80,78,71,13,10,26,10]),
                ("application/pdf", "%PDF-1.7\nTest"u8.ToArray()),
                ("video/mp4", [0,0,0,24,102,116,121,112,105,115,111,109,0,0,0,0,105,115,111,109,0,0,0,0]),
                ("audio/wav", Wav())
            };
            foreach (var (mime, bytes) in files)
            {
                storage.Bytes = bytes;
                storage.Mime = mime;
                var upload = await media.CreateMessagingAsync(owner, new("Attachment", mime, bytes.Length), default);
                Assert.Equal(404, (await Assert.ThrowsAsync<ApiException>(() => media.FinalizeAsync(upload.File.Id, other, default))).Status);
                var ready = await media.FinalizeAsync(upload.File.Id, owner, default);
                Assert.Equal("Ready", ready.State);
                Assert.Equal(mime == "audio/wav" ? 1000L : null, ready.DurationMs);
                db.ChangeTracker.Clear();
                var record = await media.RequireReadyAsync(ready.Id, owner, default);
                Assert.Equal(ready.DurationMs, record.DurationMs);
                Assert.Contains("/attachments/", record.ObjectKey);
                Assert.Equal(404, (await Assert.ThrowsAsync<ApiException>(() => media.OpenReadAsync(ready.Id, other, default))).Status);
                await using var download = await media.OpenReadAsync(ready.Id, owner, default);
                await using var result = new MemoryStream();
                await download.CopyToAsync(result);
                Assert.Equal(bytes, result.ToArray());
                await media.PinAsync(ready.Id, owner, default);
                db.ChangeTracker.Clear();
                Assert.Equal("MEDIA_IN_USE", (await Assert.ThrowsAsync<ApiException>(() => media.DeleteAsync(ready.Id, owner, ready.Version + 1, default))).Code);
            }
            storage.Mime = "video/mp4";
            storage.Bytes = files[2].Bytes;
            var libraryVideo = await media.CreateAsync(owner, new("Library video", storage.Mime, storage.Bytes.Length), default);
            Assert.Equal(404, (await Assert.ThrowsAsync<ApiException>(() => media.FinalizeMessagingAsync(libraryVideo.File.Id, owner, default))).Status);
            Assert.Equal(404, (await Assert.ThrowsAsync<ApiException>(() => media.DeleteMessagingAsync(libraryVideo.File.Id, owner, 1, default))).Status);
            storage.Bytes = "not a png"u8.ToArray();
            storage.Mime = "image/png";
            var invalid = await media.CreateMessagingAsync(owner, new("Spoofed image", "image/png", storage.Bytes.Length), default);
            Assert.Equal("MEDIA_FORMAT_INVALID", (await Assert.ThrowsAsync<ApiException>(() => media.FinalizeAsync(invalid.File.Id, owner, default))).Code);
        }
        finally
        {
            await using var drop = admin.CreateCommand($"DROP DATABASE {databaseName}");
            await drop.ExecuteNonQueryAsync();
        }
    }

    private static byte[] Wav()
    {
        using var stream = new MemoryStream();
        using var writer = new BinaryWriter(stream, Encoding.UTF8, true);
        writer.Write("RIFF"u8);
        writer.Write(16036);
        writer.Write("WAVEfmt "u8);
        writer.Write(16);
        writer.Write((short)1);
        writer.Write((short)1);
        writer.Write(8000);
        writer.Write(16000);
        writer.Write((short)2);
        writer.Write((short)16);
        writer.Write("data"u8);
        writer.Write(16000);
        writer.Write(new byte[16000]);
        return stream.ToArray();
    }

    private sealed class PrivateStorage : IPrivateObjectStorage
    {
        public byte[] Bytes = []; public string Mime = "";
        public Task<string> CreateUploadUrlAsync(string bucket, string key, CancellationToken ct) => Task.FromResult("https://private.invalid/signed-upload");
        public Task<string> CreateReadUrlAsync(string bucket, string key, CancellationToken ct) => Task.FromResult("https://private.invalid/signed-read");
        public Task<StoredObject> InspectAsync(string bucket, string key, CancellationToken ct) => Task.FromResult(new StoredObject(Bytes.Length, Mime, Bytes));
        public Task<Stream> OpenReadAsync(string bucket, string key, CancellationToken ct) => Task.FromResult<Stream>(new MemoryStream(Bytes));
        public Task DeleteAsync(string bucket, string key, CancellationToken ct) => Task.CompletedTask;
    }
}
