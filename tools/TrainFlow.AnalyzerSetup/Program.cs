using System.Diagnostics;
using System.Formats.Tar;
using System.IO.Compression;
using System.Reflection;
using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.Win32;

namespace TrainFlow.AnalyzerSetup;

internal sealed record Asset(string Name, string Target, long Size, string Sha256);
internal sealed record Release(string Version, string BaseUrl, string WebOrigin, Asset[] Assets);

internal static class Program
{
    [STAThread]
    private static int Main(string[] args)
    {
        using var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("release.json")!;
        var release = JsonSerializer.Deserialize<Release>(stream, new JsonSerializerOptions(JsonSerializerDefaults.Web))!;
        if (args is ["--verify-runtime", var archive, var directory])
        {
            if (Directory.Exists(directory)) return 2;
            Directory.CreateDirectory(directory);
            try
            {
                using var source = File.OpenRead(archive);
                using var gzip = new GZipStream(source, CompressionMode.Decompress);
                TarFile.ExtractToDirectory(gzip, directory, overwriteFiles: false);
                SetupForm.RunAsync(Path.Combine(directory, "python.exe"), [Path.Combine(directory, "Scripts/conda-unpack-script.py")], directory, default).GetAwaiter().GetResult();
                SetupForm.RunAsync(Path.Combine(directory, "python.exe"), ["-m", "pip", "check"], directory, default).GetAwaiter().GetResult();
                var imports = Path.GetFileName(archive) == "pose.tar.gz" ? "import torch,mmcv,mmpose" : "import torch,cv2,av";
                SetupForm.RunAsync(Path.Combine(directory, "python.exe"), ["-c", imports], directory, default).GetAwaiter().GetResult();
                return 0;
            }
            catch (Exception error) { File.WriteAllText(Path.Combine(directory, "verification-failure.txt"), error.ToString()); return 1; }
        }
        if (args is ["--verify", var folder])
        {
            foreach (var asset in release.Assets)
            {
                using var file = File.OpenRead(Path.Combine(folder, asset.Name));
                if (file.Length != asset.Size || !Convert.ToHexString(SHA256.HashData(file)).Equals(asset.Sha256, StringComparison.OrdinalIgnoreCase)) return 1;
            }
            return 0;
        }
        ApplicationConfiguration.Initialize();
        Application.Run(new SetupForm(release, args is ["--update"]));
        return 0;
    }
}

internal sealed class SetupForm : Form
{
    private readonly Release release;
    private readonly Label status = new() { AutoSize = true, MaximumSize = new Size(540, 0), Text = "Install the local Python environments, offline models and Metrivum analyzer. An NVIDIA CUDA-compatible GPU and sufficient free memory are required. Videos are analyzed locally; the web app stores completed videos and results privately." };
    private readonly ProgressBar progress = new() { Width = 540 };
    private readonly Button install = new() { Text = "Install", AutoSize = true };
    private readonly Button cancel = new() { Text = "Close", AutoSize = true };
    private readonly CancellationTokenSource cancellation = new();
    private bool running;
    private readonly bool automaticUpdate;
    private readonly string destination = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs", "TrainFlowAnalyzer");
    private string Staging => destination + ".update";
    private string Previous => destination + ".previous";
    private string InstalledManifest => Path.Combine(destination, "installed.json");
    private bool Existing => Directory.Exists(destination) && File.Exists(Path.Combine(destination, "TrainFlow.LocalAnalyzer.exe"));

    public SetupForm(Release release, bool automaticUpdate = false)
    {
        this.automaticUpdate = automaticUpdate;
        this.release = release;
        // A previous update that stopped half way: put the old installation back before anything else.
        try { if (!Directory.Exists(destination) && Directory.Exists(Previous)) Directory.Move(Previous, destination); } catch (IOException) { } catch (UnauthorizedAccessException) { }
        Text = "Metrivum Local Analyzer Setup"; Width = 620; Height = 450; MinimumSize = new Size(620, 450); StartPosition = FormStartPosition.CenterScreen;
        var layout = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.TopDown, Padding = new Padding(24), WrapContents = false, AutoScroll = true };
        layout.Controls.Add(status);
        var changed = Changed();
        if (Existing)
        {
            install.Text = "Update";
            status.Text = "Metrivum Analyzer is already installed. Update replaces it with this version: a running analyzer is closed first, "
                + "videos in its queue and the pairing with your browser are kept, and the current version stays in place if anything fails.";
        }
        var size = changed.Sum(a => a.Size) / 1073741824d;
        layout.Controls.Add(new Label { AutoSize = true, MaximumSize = new Size(540, 0), Text = Existing
            ? (changed.Length == release.Assets.Length
                ? $"Download: {size:F1} GB (everything once: this installation does not list its parts yet; later updates download only what changed).\nInstalled in: {destination}"
                : changed.Length == 0 ? $"Everything is up to date; Update only repairs the configuration.\nInstalled in: {destination}"
                : $"Download: {Math.Max(0.01, size):F2} GB (only the parts that changed).\nInstalled in: {destination}")
            : $"Download: {size:F1} GB. Allow at least 35 GB free disk space.\nInstall to: {destination}" });
        layout.Controls.Add(progress); layout.Controls.Add(install); layout.Controls.Add(cancel); Controls.Add(layout);
        install.Click += async (_, _) => await InstallAsync();
        cancel.Click += (_, _) => { if (running) cancellation.Cancel(); else Close(); };
        FormClosing += (_, e) => { if (running) { cancellation.Cancel(); e.Cancel = true; } };
        if (automaticUpdate) Shown += async (_, _) => await InstallAsync();
    }

    /// <summary>Every step and any failure go to this file too, so a closed window still leaves the reason.</summary>
    private static readonly string LogPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "TrainFlowAnalyzer-setup.log");
    private static void Log(string line)
    {
        try { File.AppendAllText(LogPath, $"{DateTimeOffset.Now:O} {line}{Environment.NewLine}"); } catch (IOException) { } catch (UnauthorizedAccessException) { }
    }

    /// <summary>Overall progress across all work, weighted by bytes: download, extraction, then configuration.</summary>
    private void Report(string text, double fraction)
    {
        void Apply() { status.Text = text; progress.Value = (int)Math.Clamp(fraction * 1000, 0, 1000); }
        if (InvokeRequired) BeginInvoke(Apply); else Apply();
    }

    private async Task InstallAsync()
    {
        var update = Existing;
        var changed = Changed();
        Log($"{(update ? "Update" : "Install")} {release.Version} in {destination}: {changed.Length} of {release.Assets.Length} parts to download");
        if (!update && Directory.Exists(destination)) { status.Text = $"The folder {destination} exists but holds no analyzer. Remove it, then install again."; Log("Stopped: unknown folder"); return; }
        // Archives are unpacked next to the installation: room for the download and the unpacked files.
        var needed = update ? (long)(changed.Sum(a => a.Size) * 2.5) + (1L << 30) : 35L * 1024 * 1024 * 1024;
        var free = new DriveInfo(Path.GetPathRoot(destination)!).AvailableFreeSpace;
        if (update && free < needed)
        {
            if (automaticUpdate) { status.Text = $"At least {needed / 1073741824d:F0} GB of free disk space is required. The installed version is unchanged."; return; }
            // Not enough room to keep the current version while the new one is unpacked: offer a clean reinstall instead.
            var answer = MessageBox.Show(this, $"Updating next to the current version needs {needed / 1073741824d:F0} GB free.\n\nRemove the current version first and install this one from scratch? "
                + "Videos in the queue and the browser pairing are kept. If the installation then fails, install it again.", "Metrivum Analyzer", MessageBoxButtons.YesNo, MessageBoxIcon.Question);
            if (answer != DialogResult.Yes) { status.Text = $"At least {needed / 1073741824d:F0} GB of free disk space is required to update."; Log("Stopped: not enough space to update side by side"); return; }
            install.Enabled = false;
            try
            {
                Report("Closing the running analyzer…", 0);
                await StopRunningAnalyzerAsync();
                Report("Removing the current version…", 0);
                await Task.Run(() => Directory.Delete(destination, true));
                Log("Removed the current version for a clean install");
            }
            catch (Exception error) when (error is IOException or UnauthorizedAccessException)
            {
                status.Text = $"The current version could not be removed: {error.Message}\nClose the analyzer window and try again."; install.Enabled = true; Log("Remove failed: " + error); return;
            }
            update = false; changed = release.Assets; needed = 35L * 1024 * 1024 * 1024;
        }
        if (new DriveInfo(Path.GetPathRoot(destination)!).AvailableFreeSpace < needed) { status.Text = $"At least {needed / 1073741824d:F0} GB of free disk space is required."; Log("Stopped: not enough disk space"); return; }
        running = true; install.Enabled = false; cancel.Text = "Cancel"; progress.Maximum = 1000;
        var created = false;
        var work = update ? Staging : destination;
        var moved = new List<(string From, string To)>();
        var swapped = false;
        try
        {
            if (update)
            {
                Report("Closing the running analyzer…", 0);
                await StopRunningAnalyzerAsync();
                if (Directory.Exists(Staging)) Directory.Delete(Staging, true);
                if (Directory.Exists(Previous)) Directory.Delete(Previous, true);
            }
            var source = new Uri(release.BaseUrl);
            if (source.Scheme != "https" && !(source.IsLoopback && source.Scheme == "http")) throw new InvalidDataException("Invalid release source.");
            Directory.CreateDirectory(work); created = true;
            using var client = new HttpClient(new HttpClientHandler { AllowAutoRedirect = false }) { Timeout = Timeout.InfiniteTimeSpan };
            var targets = new Dictionary<string, string> { ["pose.tar.gz"] = "env/pose", ["vision.tar.gz"] = "env/vision", ["points.tar.gz"] = "env/points", ["host.tar.gz"] = ".", ["source.tar.gz"] = "motiontrace", ["models.tar.gz"] = "motiontrace/.models", ["torch.tar.gz"] = "torch" };
            var token = cancellation.Token;
            // Download and extraction each weigh their bytes (45 % + 45 %); configuring Python takes the last 10 %.
            var total = Math.Max(1d, changed.Sum(a => a.Size));
            long downloaded = 0, extracted = 0;
            double Overall() => 0.45 * downloaded / total + 0.45 * extracted / total;
            Task? extracting = null;
            if (release.Assets.Any(asset => !targets.TryGetValue(asset.Name, out var known) || known != asset.Target)) throw new InvalidDataException("Invalid release asset.");
            foreach (var asset in changed)
            {
                var target = asset.Target;
                Report("Downloading " + asset.Name, Overall());
                var temporary = Path.Combine(work, asset.Name + ".partial");
                // The checksum is computed while the bytes arrive, so a multi-GB archive is not read a second time.
                using var hash = IncrementalHash.CreateHash(HashAlgorithmName.SHA256);
                using (var response = await client.GetAsync(new Uri(source, asset.Name), HttpCompletionOption.ResponseHeadersRead, token))
                {
                    response.EnsureSuccessStatusCode();
                    await using var input = await response.Content.ReadAsStreamAsync(token);
                    await using var output = new FileStream(temporary, FileMode.CreateNew, FileAccess.Write, FileShare.None, 1 << 20, true);
                    var buffer = new byte[1 << 20]; long length = 0; int count;
                    while ((count = await input.ReadAsync(buffer, token)) > 0)
                    {
                        length += count;
                        if (length > asset.Size) throw new InvalidDataException("Download exceeds the release size.");
                        hash.AppendData(buffer, 0, count);
                        await output.WriteAsync(buffer.AsMemory(0, count), token);
                        Interlocked.Add(ref downloaded, count);
                        Report("Downloading " + asset.Name, Overall());
                    }
                    if (length != asset.Size) throw new InvalidDataException("Incomplete download.");
                }
                if (!Convert.ToHexString(hash.GetHashAndReset()).Equals(asset.Sha256, StringComparison.OrdinalIgnoreCase)) throw new InvalidDataException("Download integrity check failed: " + asset.Name);
                Log("Downloaded and verified " + asset.Name);
                // Extract the previous archive while the next one downloads; one extraction at a time keeps disk I/O sane.
                if (extracting != null) await extracting;
                var name = asset.Name;
                extracting = Task.Run(() =>
                {
                    Report("Extracting " + name, Overall());
                    using (var file = new FileStream(temporary, FileMode.Open, FileAccess.Read, FileShare.Read, 1 << 20))
                    using (var counted = new ProgressStream(file, read => { Interlocked.Add(ref extracted, read); Report("Extracting " + name, Overall()); }))
                    using (var gzip = new GZipStream(counted, CompressionMode.Decompress))
                    {
                        var extractionDirectory = Path.Combine(work, target);
                        Directory.CreateDirectory(extractionDirectory);
                        TarFile.ExtractToDirectory(gzip, extractionDirectory, overwriteFiles: false);
                    }
                    File.Delete(temporary);
                    Log("Extracted " + name);
                }, token);
            }
            if (extracting != null) await extracting;
            token.ThrowIfCancellationRequested();
            if (update)
            {
                // Unchanged parts move over from the current installation (same disk: instant), then the folders swap.
                Report("Replacing the installed version…", 0.9);
                foreach (var asset in release.Assets.Except(changed).Where(a => a.Target != ".").OrderBy(a => a.Target.Count(c => c == '/')))
                    Merge(Path.Combine(destination, asset.Target), Path.Combine(Staging, asset.Target), moved);
                Directory.Move(destination, Previous);
                swapped = true;
                Directory.Move(Staging, destination);
                Log("Swapped in the new version");
            }
            // The environments are independent: relocate the newly unpacked ones at the same time (in their final folder).
            var environments = changed.Where(a => a.Target.StartsWith("env/", StringComparison.Ordinal)).Select(a => a.Target[4..]).ToArray();
            var configured = 0;
            Report($"Configuring Python environments (0 of {environments.Length})", 0.9);
            await Task.WhenAll(environments.Select(async name =>
            {
                var prefix = Path.Combine(destination, "env", name);
                await RunAsync(Path.Combine(prefix, "python.exe"), [Path.Combine(prefix, "Scripts", "conda-unpack-script.py")], prefix, token);
                var done = Interlocked.Increment(ref configured);
                Log("Configured environment " + name);
                Report($"Configuring Python environments ({done} of {environments.Length})", 0.9 + 0.09 * done / environments.Length);
            }));
            await WriteConfigurationAsync(token);
            // Which archive each part came from, so the next update downloads only what changed.
            await File.WriteAllTextAsync(InstalledManifest, JsonSerializer.Serialize(new { release.Version, Parts = release.Assets.ToDictionary(a => a.Target, a => a.Sha256) }), token);
            CreateShortcut(); RegisterUninstall(); RegisterLink();
            if (update)
            {
                Report("Removing the previous version…", 0.995);
                var old = Previous;
                await Task.Run(() => { try { Directory.Delete(old, true); } catch (IOException) { } catch (UnauthorizedAccessException) { } });
            }
            Log(update ? "Updated" : "Installed");
            status.Text = (update ? "Updated. " : "Installed. ") + "Metrivum starts the analyzer for you when you analyze a video; you can also start it from the Start menu.";
            progress.Value = progress.Maximum; cancel.Text = "Close";
            install.Enabled = false;
            if (automaticUpdate)
            {
                Process.Start(new ProcessStartInfo(Path.Combine(destination, "TrainFlow.LocalAnalyzer.exe")) { UseShellExecute = true, WorkingDirectory = destination });
                BeginInvoke(new Action(Close));
            }
            var start = new Button { Text = "Start analyzer", AutoSize = true };
            start.Click += (_, _) => Process.Start(new ProcessStartInfo(Path.Combine(destination, "TrainFlow.LocalAnalyzer.exe")) { UseShellExecute = true, WorkingDirectory = destination });
            ((FlowLayoutPanel)Controls[0]).Controls.Add(start);
        }
        catch (Exception error)
        {
            Log("Failed: " + error);
            if (update)
            {
                // Put the current installation back exactly as it was; only the staging folder is discarded.
                try
                {
                    if (swapped && Directory.Exists(Previous))
                    {
                        if (Directory.Exists(destination)) Directory.Move(destination, Staging);
                        Directory.Move(Previous, destination);
                    }
                    foreach (var (from, to) in Enumerable.Reverse(moved)) if (Directory.Exists(to) || File.Exists(to)) MoveEntry(to, from);
                }
                catch (Exception restore) { Log("Restore failed: " + restore); }
                try { if (Directory.Exists(Staging)) Directory.Delete(Staging, true); } catch (IOException) { } catch (UnauthorizedAccessException) { }
                status.Text = error is OperationCanceledException ? "Update cancelled. The installed version is unchanged." : $"Update failed: {error.Message}\nThe installed version is unchanged. Details: {LogPath}";
            }
            else
            {
                status.Text = error is OperationCanceledException ? "Installation cancelled." : $"Installation failed: {error.Message}\nDetails: {LogPath}";
                // Only remove the fixed new directory this invocation created; existing installations are never touched.
                if (created) { try { Directory.Delete(destination, true); } catch (IOException) { } catch (UnauthorizedAccessException) { } }
            }
            cancel.Text = "Close";
        }
        finally { running = false; }
    }

    /// <summary>Release parts that differ from the installed ones (all of them for a new install or an installation without installed.json).</summary>
    private Asset[] Changed()
    {
        if (!Existing) return release.Assets;
        try
        {
            using var document = JsonDocument.Parse(File.ReadAllText(InstalledManifest));
            var parts = document.RootElement.GetProperty("Parts");
            return release.Assets.Where(a => a.Target == "." || !parts.TryGetProperty(a.Target, out var sha) || !string.Equals(sha.GetString(), a.Sha256, StringComparison.OrdinalIgnoreCase)
                || !Directory.Exists(Path.Combine(destination, a.Target))).ToArray();
        }
        catch (Exception error) when (error is IOException or JsonException or KeyNotFoundException or UnauthorizedAccessException) { return release.Assets; }
    }

    /// <summary>Moves an unchanged part into the new version; entries already unpacked there (a changed nested part) win.</summary>
    private static void Merge(string from, string to, List<(string From, string To)> moved)
    {
        if (!Directory.Exists(from)) return;
        if (!Directory.Exists(to))
        {
            Directory.CreateDirectory(Path.GetDirectoryName(to)!);
            Directory.Move(from, to); moved.Add((from, to));
            return;
        }
        foreach (var entry in Directory.EnumerateFileSystemEntries(from))
        {
            var target = Path.Combine(to, Path.GetFileName(entry));
            if (Directory.Exists(target) || File.Exists(target)) continue;
            MoveEntry(entry, target); moved.Add((entry, target));
        }
    }

    private static void MoveEntry(string from, string to)
    {
        if (Directory.Exists(from)) Directory.Move(from, to); else File.Move(from, to);
    }

    /// <summary>Closes this installation's analyzer (and its Python workers) so its files can be replaced.</summary>
    private async Task StopRunningAnalyzerAsync()
    {
        var executable = Path.GetFullPath(Path.Combine(destination, "TrainFlow.LocalAnalyzer.exe"));
        foreach (var process in Process.GetProcessesByName("TrainFlow.LocalAnalyzer"))
        {
            using (process)
            {
                string? path;
                try { path = process.MainModule?.FileName; } catch (Exception error) when (error is System.ComponentModel.Win32Exception or InvalidOperationException) { continue; }
                if (path is null || !string.Equals(Path.GetFullPath(path), executable, StringComparison.OrdinalIgnoreCase)) continue;
                Log("Closing the running analyzer");
                try { // The updater is a child of this analyzer. Killing its whole tree would include
                    // this installer; .NET rejects that operation and leaves the analyzer alive.
                    process.Kill();
                    using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(20));
                    await process.WaitForExitAsync(timeout.Token); }
                catch (InvalidOperationException) when (process.HasExited) { }
            }
        }
        // Manual installation may interrupt inference. Stop only workers from this installation,
        // never the updater or unrelated Python environments.
        var environmentRoot = Path.GetFullPath(Path.Combine(destination, "env")) + Path.DirectorySeparatorChar;
        foreach (var worker in Process.GetProcessesByName("python"))
        {
            using (worker)
            {
                string? path;
                try { path = worker.MainModule?.FileName; }
                catch (Exception error) when (error is System.ComponentModel.Win32Exception or InvalidOperationException) { continue; }
                if (path is null || !Path.GetFullPath(path).StartsWith(environmentRoot, StringComparison.OrdinalIgnoreCase)) continue;
                try { worker.Kill(entireProcessTree: true); await worker.WaitForExitAsync(); }
                catch (InvalidOperationException) when (worker.HasExited) { }
            }
        }
        // Windows releases file handles a moment after the process ends.
        await Task.Delay(500);
    }

    /// <summary>"trainflow-analyzer://start" in the browser starts the installed analyzer (per user, no admin rights).</summary>
    private void RegisterLink()
    {
        using var key = Registry.CurrentUser.CreateSubKey(@"Software\Classes\trainflow-analyzer");
        key.SetValue("", "URL:Metrivum Analyzer"); key.SetValue("URL Protocol", "");
        using var command = key.CreateSubKey(@"shell\open\command");
        command.SetValue("", $"\"{Path.Combine(destination, "TrainFlow.LocalAnalyzer.exe")}\"");
    }

    private async Task WriteConfigurationAsync(CancellationToken token)
    {
        var motiontrace = Path.Combine(destination, "motiontrace");
        var settings = Path.Combine(destination, "settings"); Directory.CreateDirectory(settings);
        var json = new JsonSerializerOptions { WriteIndented = true };
        await File.WriteAllTextAsync(Path.Combine(settings, "settings.json"), JsonSerializer.Serialize(new {
            PythonExecutable = Path.Combine(destination, "env/pose/python.exe"), VisionExecutablePath = Path.Combine(destination, "env/vision/python.exe"),
            PointsExecutablePath = Path.Combine(destination, "env/points/python.exe"), ModelsRoot = Path.Combine(motiontrace, ".models/vision"),
            PointsModelsRoot = Path.Combine(motiontrace, ".models/points"), Device = "cuda:0", PoseModel = "rtmpose-l_8xb256-420e_body8-384x288", PoseWeights = "", CropPadding = .2, TapNextResolution = 256
        }, json), token);
        await File.WriteAllTextAsync(Path.Combine(destination, "analyzer.json"), JsonSerializer.Serialize(new { MotionTraceRoot = "motiontrace", SettingsPath = "settings/settings.json", TorchHome = "torch", WebOrigin = release.WebOrigin }, json), token);
    }

    internal static async Task RunAsync(string executable, string[] args, string directory, CancellationToken token)
    {
        var start = new ProcessStartInfo(executable) { WorkingDirectory = directory, UseShellExecute = false, CreateNoWindow = true, RedirectStandardError = true };
        foreach (var argument in args) start.ArgumentList.Add(argument);
        start.Environment.Remove("PYTHONPATH"); start.Environment.Remove("PYTHONHOME");
        start.Environment["PATH"] = directory + Path.PathSeparator + Path.Combine(directory, "Library", "bin") + Path.PathSeparator + start.Environment["PATH"];
        using var process = Process.Start(start) ?? throw new InvalidOperationException("Cannot start Python configuration.");
        using var cancelled = token.Register(() => { try { if (!process.HasExited) process.Kill(true); } catch (InvalidOperationException) { } });
        var error = process.StandardError.ReadToEndAsync(token);
        await process.WaitForExitAsync(token);
        if (process.ExitCode != 0) throw new InvalidOperationException("Python relocation failed: " + await error);
    }

    private void CreateShortcut()
    {
        // Windows Script Host creates a standard per-user shortcut without administrator privileges.
        var shellType = Type.GetTypeFromProgID("WScript.Shell")!;
        dynamic shell = Activator.CreateInstance(shellType)!;
        dynamic shortcut = shell.CreateShortcut(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Programs), "Metrivum Analyzer.lnk"));
        shortcut.TargetPath = Path.Combine(destination, "TrainFlow.LocalAnalyzer.exe"); shortcut.WorkingDirectory = destination; shortcut.Save();
        var previousShortcut = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Programs), "TrainFlow Analyzer.lnk");
        if (File.Exists(previousShortcut)) File.Delete(previousShortcut);
    }

    private void RegisterUninstall()
    {
        var script = "param()\n$target = Join-Path $env:LOCALAPPDATA 'Programs/TrainFlowAnalyzer'\n" +
            "$expected = [IO.Path]::GetFullPath($target)\nif($expected -ne [IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'Programs/TrainFlowAnalyzer'))){throw 'Invalid installation path'}\n" +
            "Get-Process -Name TrainFlow.LocalAnalyzer -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq (Join-Path $expected 'TrainFlow.LocalAnalyzer.exe') } | Stop-Process\n" +
            "Remove-Item -LiteralPath $expected -Recurse -Force\nRemove-Item -LiteralPath (Join-Path ([Environment]::GetFolderPath('Programs')) 'Metrivum Analyzer.lnk') -ErrorAction SilentlyContinue\n" +
            "Remove-Item -LiteralPath 'HKCU:/Software/Microsoft/Windows/CurrentVersion/Uninstall/TrainFlowAnalyzer' -ErrorAction SilentlyContinue\n" +
            "Remove-Item -LiteralPath 'HKCU:/Software/Classes/trainflow-analyzer' -Recurse -ErrorAction SilentlyContinue\n";
        // The uninstall script lives outside the directory it removes, so no shell self-deletion is needed.
        var uninstall = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs", "Uninstall-TrainFlowAnalyzer.ps1");
        File.WriteAllText(uninstall, script);
        using var key = Registry.CurrentUser.CreateSubKey(@"Software\Microsoft\Windows\CurrentVersion\Uninstall\TrainFlowAnalyzer");
        key.SetValue("DisplayName", "Metrivum Local Analyzer"); key.SetValue("DisplayVersion", release.Version);
        key.SetValue("InstallLocation", destination); key.SetValue("UninstallString", $"powershell.exe -NoProfile -File \"{uninstall}\"");
    }
}

/// <summary>Reports how many compressed bytes the extractor has consumed.</summary>
internal sealed class ProgressStream(Stream inner, Action<int> onRead) : Stream
{
    public override bool CanRead => true;
    public override bool CanSeek => false;
    public override bool CanWrite => false;
    public override long Length => inner.Length;
    public override long Position { get => inner.Position; set => throw new NotSupportedException(); }
    public override int Read(byte[] buffer, int offset, int count) { var read = inner.Read(buffer, offset, count); if (read > 0) onRead(read); return read; }
    public override int Read(Span<byte> buffer) { var read = inner.Read(buffer); if (read > 0) onRead(read); return read; }
    public override void Flush() { }
    public override long Seek(long offset, SeekOrigin origin) => throw new NotSupportedException();
    public override void SetLength(long value) => throw new NotSupportedException();
    public override void Write(byte[] buffer, int offset, int count) => throw new NotSupportedException();
}
