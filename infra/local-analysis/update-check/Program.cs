using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Text.Json;

static void Check(bool condition) { if (!condition) throw new InvalidOperationException("Update invariant failed."); }
var folder = Path.Combine(Path.GetTempPath(), "analyzer-update-check-" + Guid.NewGuid().ToString("N"));
try
{
    var queue = new JobQueue(folder, new JsonSerializerOptions(JsonSerializerDefaults.Web));
    Check(queue.TryReserve()); Check(!queue.TryBeginUpdate()); queue.Release();
    Check(queue.TryBeginUpdate()); Check(!queue.TryBeginUpdate()); Check(!queue.TryReserve());
    queue.EndUpdate(); Check(queue.TryReserve()); queue.Release();
    Console.WriteLine("PASS: uploads and updates exclude each other; failed updates release the queue.");

    // Serve invalid packages locally. No test can reach Process.Start or run an executable.
    foreach (var scenario in new[] { "old", "size", "hash", "redirect", "overflow" })
    {
        using var listener = new TcpListener(IPAddress.Loopback, 0);
        listener.Start();
        var port = ((IPEndPoint)listener.LocalEndpoint).Port;
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(15));
        var server = Task.Run(async () =>
        {
            var requests = scenario is "hash" or "overflow" ? 2 : 1;
            for (var i = 0; i < requests; i++)
            {
                using var client = await listener.AcceptTcpClientAsync(timeout.Token);
                await using var stream = client.GetStream();
                using var reader = new StreamReader(stream, Encoding.ASCII, leaveOpen: true);
                while (await reader.ReadLineAsync(timeout.Token) is { Length: > 0 }) { }
                var body = i == 0 ? JsonSerializer.Serialize(new
                {
                    version = scenario == "old" ? "0.0.1" : "99.0.0",
                    size = scenario == "size" ? -1 : 3,
                    sha256 = new string('0', 64)
                }) : scenario == "overflow" ? "xxxx" : "xxx";
                var bytes = Encoding.UTF8.GetBytes(body);
                var status = scenario == "redirect" ? "302 Found\r\nLocation: http://127.0.0.1:1/unsafe" : "200 OK";
                await stream.WriteAsync(Encoding.ASCII.GetBytes($"HTTP/1.1 {status}\r\nContent-Type: application/json\r\nConnection: close\r\nContent-Length: {bytes.Length}\r\n\r\n"), timeout.Token);
                await stream.WriteAsync(bytes, timeout.Token);
            }
        }, timeout.Token);
        var rejected = false;
        try { await AnalyzerUpdate.InstallAsync($"http://127.0.0.1:{port}", timeout.Token, Path.Combine(folder, "downloads")); }
        catch (Exception error) when (error is InvalidDataException or HttpRequestException) { rejected = true; }
        await server;
        Check(rejected);
        Console.WriteLine($"PASS: rejected {scenario} update before executing installer.");
    }
}
finally
{
    // This exact test-owned directory is created above; no application data is inspected or deleted.
    if (Directory.Exists(folder)) Directory.Delete(folder, true);
}
