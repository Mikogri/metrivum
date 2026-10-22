using System.Diagnostics;
using System.Net.Http.Json;
using System.Security.Cryptography;

internal sealed record AnalyzerRelease(string Version, string Sha256, long Size);

internal static class AnalyzerUpdate
{
    public static string Version => typeof(AnalyzerUpdate).Assembly.GetName().Version!.ToString(3);

    // Neither the browser nor release metadata may choose the executable's source or command line.
    public static async Task<Process> InstallAsync(string origin, CancellationToken cancellation, string? downloadDirectory = null)
    {
        using var client = new HttpClient(new HttpClientHandler { AllowAutoRedirect = false }) { Timeout = TimeSpan.FromMinutes(10) };
        var root = new Uri(origin + "/downloads/analyzer/");
        var release = await client.GetFromJsonAsync<AnalyzerRelease>(new Uri(root, "update.json"), cancellation)
            ?? throw new InvalidDataException("Update information is missing.");
        if (!System.Version.TryParse(release.Version, out var next) || next <= System.Version.Parse(Version)
            || release.Size is <= 0 or > 268435456 || release.Sha256 is not { Length: 64 } || !release.Sha256.All(Uri.IsHexDigit))
            throw new InvalidDataException("Invalid or outdated update information.");
        var folder = downloadDirectory ?? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "TrainFlowAnalyzer", "updates");
        Directory.CreateDirectory(folder);
        var temporary = Path.Combine(folder, "setup.download");
        var installer = Path.Combine(folder, "TrainFlowAnalyzerSetup.exe");
        try
        {
            using var response = await client.GetAsync(new Uri(root, "TrainFlowAnalyzerSetup.exe"), HttpCompletionOption.ResponseHeadersRead, cancellation);
            response.EnsureSuccessStatusCode();
            await using (var input = await response.Content.ReadAsStreamAsync(cancellation))
            await using (var output = File.Create(temporary))
            {
                var buffer = new byte[81920];
                long received = 0;
                int count;
                while ((count = await input.ReadAsync(buffer, cancellation)) > 0)
                {
                    received += count;
                    if (received > release.Size) throw new InvalidDataException("Update exceeds its expected size.");
                    await output.WriteAsync(buffer.AsMemory(0, count), cancellation);
                }
                if (received != release.Size) throw new InvalidDataException("Incomplete update download.");
            }
            await using (var file = File.OpenRead(temporary))
                if (!Convert.ToHexString(await SHA256.HashDataAsync(file, cancellation)).Equals(release.Sha256, StringComparison.OrdinalIgnoreCase))
                    throw new InvalidDataException("Update verification failed.");
            File.Move(temporary, installer, overwrite: true);
            // Development permits loopback HTTP. Published HTTPS releases require a trusted Windows signature.
            if (root.Scheme == "https")
            {
                var verify = new ProcessStartInfo("powershell.exe") { UseShellExecute = false, CreateNoWindow = true };
                foreach (var arg in new[] { "-NoProfile", "-NonInteractive", "-Command", "$s=Get-AuthenticodeSignature -LiteralPath $env:TRAINFLOW_UPDATE_FILE; if($s.Status -ne 'Valid'){exit 1}" }) verify.ArgumentList.Add(arg);
                verify.Environment["TRAINFLOW_UPDATE_FILE"] = installer;
                using var process = Process.Start(verify) ?? throw new IOException("Cannot verify update signature.");
                await process.WaitForExitAsync(cancellation);
                if (process.ExitCode != 0) throw new InvalidDataException("Update signature is not trusted.");
            }
            var start = new ProcessStartInfo(installer) { UseShellExecute = true, WorkingDirectory = folder };
            start.ArgumentList.Add("--update");
            return Process.Start(start) ?? throw new IOException("Cannot start the updater.");
        }
        finally { if (File.Exists(temporary)) File.Delete(temporary); }
    }
}
