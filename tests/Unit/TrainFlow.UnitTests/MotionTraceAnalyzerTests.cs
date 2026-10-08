using System.Diagnostics;
using System.Text.Json;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using TrainFlow.BuildingBlocks;
using TrainFlow.VideoAnalysis;

namespace TrainFlow.UnitTests;

public sealed class MotionTraceAnalyzerTests : IDisposable
{
    private readonly string root = Path.Combine(Path.GetTempPath(), "TrainFlow-adapter-tests", Guid.NewGuid().ToString("N"));
    private static readonly AnalysisConfiguration Tracking = JsonSerializer.Deserialize<AnalysisConfiguration>(
        """{"movement":"deadlift","tracking":{"timestampSeconds":0,"videoWidth":640,"videoHeight":480,"points":[{"x":100,"y":100},{"x":200,"y":100}]}}""", AnalysisResults.Json)!;

    [Fact]
    public void DisabledOrMissingBridgeIsUnavailable()
    {
        var (analyzer, options) = Create("valid");
        Assert.True(analyzer.IsConfigured);
        options.Enabled = false;
        Assert.False(analyzer.IsConfigured);
        options.Enabled = true;
        options.BridgePath += ".missing";
        Assert.False(analyzer.IsConfigured);
    }

    [Fact]
    public void ModuleKeepsUnavailableFallbackAndExplicitAnalyzerOverrides()
    {
        var config = new ConfigurationBuilder().Build();
        var services = new ServiceCollection();
        services.AddSingleton<IConfiguration>(config);
        services.AddLogging();
        services.AddVideoAnalysis(config);
        using (var provider = services.BuildServiceProvider())
            Assert.IsType<UnavailableVideoAnalyzer>(provider.GetRequiredService<IVideoAnalyzer>());
        var replacement = new UnavailableVideoAnalyzer();
        var custom = new ServiceCollection();
        custom.AddSingleton<IVideoAnalyzer>(replacement);
        custom.AddVideoAnalysis(config);
        using var customProvider = custom.BuildServiceProvider();
        Assert.Same(replacement, customProvider.GetRequiredService<IVideoAnalyzer>());
    }

    [Fact]
    public async Task ValidOutputIsReadAndPrivateJobFilesAreRemoved()
    {
        var (analyzer, options) = Create("valid");
        var result = await analyzer.AnalyzeAsync(new MemoryStream([1, 2, 3]), Tracking, CancellationToken.None);
        Assert.Equal("fake-test-engine", result.EngineVersion);
        Assert.Equal("px", result.PositionUnit);
        Assert.Empty(Directory.GetDirectories(options.WorkDirectory));
    }

    [Fact]
    public void TrackingAndPixelUnitsAreRequired()
    {
        var (analyzer, _) = Create("valid");
        Assert.Throws<ApiException>(() => analyzer.ValidateConfiguration(new AnalysisConfiguration()));
        Assert.Throws<ApiException>(() => analyzer.ValidateConfiguration(Tracking with { MetersPerPixel = 0.01 }));
        analyzer.ValidateConfiguration(Tracking);
    }

    [Fact]
    public async Task VerboseEngineOutputDoesNotBlockOrBecomeTheResult()
    {
        var (analyzer, _) = Create("verbose");
        var result = await analyzer.AnalyzeAsync(new MemoryStream([1]), Tracking, CancellationToken.None);
        Assert.Equal("fake-test-engine", result.EngineVersion);
    }

    [Fact]
    public async Task AdapterAlsoEnforcesRuntimeTimeoutOutsideWorker()
    {
        var (analyzer, options) = Create("sleep", 2);
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => analyzer.AnalyzeAsync(new MemoryStream([1]), Tracking, CancellationToken.None));
        Assert.Empty(Directory.GetDirectories(options.WorkDirectory));
    }

    [Theory]
    [InlineData("nonzero", "ANALYSIS_EXECUTION_FAILED")]
    [InlineData("oversize", "ANALYSIS_RESULT_INVALID")]
    [InlineData("malformed", "ANALYSIS_RESULT_INVALID")]
    public async Task BadOutputFailsSafelyAndCleansUp(string mode, string code)
    {
        var (analyzer, options) = Create(mode);
        var error = await Assert.ThrowsAsync<ApiException>(() => analyzer.AnalyzeAsync(new MemoryStream([1]), Tracking, CancellationToken.None));
        Assert.Equal(code, error.Code);
        Assert.DoesNotContain(root, error.Message);
        Assert.DoesNotContain("private-engine-diagnostic", error.Message);
        Assert.Empty(Directory.GetDirectories(options.WorkDirectory));
    }

    [Fact]
    public async Task OversizedInputIsRejectedBeforeStartingProcess()
    {
        var (analyzer, options) = Create("valid");
        var error = await Assert.ThrowsAsync<ApiException>(() => analyzer.AnalyzeAsync(new MemoryStream(new byte[101]), Tracking, CancellationToken.None));
        Assert.Equal("MEDIA_SIZE_INVALID", error.Code);
        Assert.Empty(Directory.GetDirectories(options.WorkDirectory));
    }

    [Fact]
    public async Task CancellationStopsRunningProcessBeforeRemovingFiles()
    {
        var (analyzer, options) = Create("sleep");
        using var cancellation = new CancellationTokenSource();
        var run = analyzer.AnalyzeAsync(new MemoryStream([1]), Tracking, cancellation.Token);
        var marker = Path.Combine(root, "started");
        using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(15));
        while (!File.Exists(marker))
            await Task.Delay(50, deadline.Token);
        var pids = (await File.ReadAllTextAsync(marker, deadline.Token)).Trim().Split(' ').Select(int.Parse).ToArray();
        cancellation.Cancel();
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => run);
        Assert.Empty(Directory.GetDirectories(options.WorkDirectory));
        Assert.All(pids, pid => Assert.True(HasExited(pid)));
    }

    private static bool HasExited(int pid)
    {
        try
        {
            using var process = Process.GetProcessById(pid);
            return process.HasExited;
        }
        catch (ArgumentException) { return true; }
    }

    private (MotionTraceAnalyzer Analyzer, MotionTraceOptions Options) Create(string mode, int maxRunSeconds = 30)
    {
        Directory.CreateDirectory(root);
        var bridge = Path.Combine(root, OperatingSystem.IsWindows() ? "bridge.ps1" : "bridge.sh");
        var result = JsonSerializer.Serialize(new AnalysisResult(1, "fake-test-engine", "fake-test-model", "test", "px", null, [], [], []), AnalysisResults.Json);
        var marker = Path.Combine(root, "started").Replace("'", "''");
        var script = OperatingSystem.IsWindows() ? mode switch
        {
            "nonzero" => "[Console]::Error.Write('private-engine-diagnostic'); exit 7",
            "oversize" => "[IO.File]::WriteAllText($args[3], ('x' * 2048))",
            "malformed" => "[IO.File]::WriteAllText($args[3], '{')",
            "sleep" => $"$child = Start-Process -FilePath (Join-Path $PSHOME 'powershell.exe') -WindowStyle Hidden -ArgumentList '-NoProfile', '-Command', 'Start-Sleep -Seconds 60' -PassThru; [IO.File]::WriteAllText('{marker}', \"$PID $($child.Id)\"); Start-Sleep -Seconds 60",
            _ => $"$request = Get-Content -Raw $args[1] | ConvertFrom-Json; if (!(Test-Path $request.videoPath) -or !$request.configuration.tracking -or $request.cacheDirectory -ne (Split-Path $args[1])) {{exit 9}}; [IO.File]::WriteAllText($args[3], '{result}')"
        } : mode switch
        {
            "nonzero" => "echo private-engine-diagnostic >&2; exit 7",
            "oversize" => "head -c 2048 /dev/zero > \"$4\"",
            "malformed" => "printf '{' > \"$4\"",
            "sleep" => $"sleep 60 & child=$!; echo $$ $child > '{marker}'; wait",
            _ => $"printf '%s' '{result}' > \"$4\""
        };
        if (mode == "verbose")
            script = (OperatingSystem.IsWindows()
                ? "[Console]::Out.Write(('x' * 100000)); [Console]::Error.Write(('y' * 100000)); "
                : "head -c 100000 /dev/zero; head -c 100000 /dev/zero >&2; ") + script;
        File.WriteAllText(bridge, script);
        var options = new MotionTraceOptions
        {
            Enabled = true,
            BridgePath = bridge,
            MotionTraceRoot = root,
            WorkDirectory = Path.Combine(root, "jobs") + Path.DirectorySeparatorChar,
            DotnetExecutable = OperatingSystem.IsWindows()
                ? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System), "WindowsPowerShell", "v1.0", "powershell.exe") : "/bin/sh"
        };
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> { ["Storage:MaxVideoBytes"] = "100" }).Build();
        return (new MotionTraceAnalyzer(Options.Create(options), Options.Create(new AnalysisOptions { MaxResultBytes = 1024, MaxRunSeconds = maxRunSeconds }), config,
            NullLogger<MotionTraceAnalyzer>.Instance), options);
    }

    public void Dispose()
    {
        if (Directory.Exists(root))
            Directory.Delete(root, true);
    }
}
