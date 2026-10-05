using System.Diagnostics;

namespace TrainFlow.IntegrationTests;

public sealed class MediaWorkerStartupTests
{
    [Theory]
    [InlineData("Production", "Disable", true)]
    [InlineData("Production", "Prefer", true)]
    [InlineData("Production", "Require", true)]
    [InlineData("Production", "VerifyCA", true)]
    [InlineData("Production", "VerifyFull", false)]
    [InlineData("Development", "Disable", false)]
    [InlineData("Testing", "Disable", false)]
    public async Task WorkerRequiresVerifiedTlsBeforeConnectingOutsideLocalEnvironments(string environment, string sslMode, bool rejected)
    {
        var root = new DirectoryInfo(AppContext.BaseDirectory);
        while (root != null && !File.Exists(Path.Combine(root.FullName, "TrainFlow.slnx")))
            root = root.Parent;
        Assert.NotNull(root);
        var output = new DirectoryInfo(AppContext.BaseDirectory);
        var worker = Path.Combine(root.FullName, "workers", "TrainFlow.Worker", "bin", output.Parent!.Name, output.Name, "TrainFlow.Worker.dll");
        Assert.True(File.Exists(worker), "Build TrainFlow.slnx before running worker startup integration tests.");
        var start = new ProcessStartInfo("dotnet")
        {
            WorkingDirectory = root.FullName,
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true
        };
        start.ArgumentList.Add(worker);
        start.Environment["DOTNET_ENVIRONMENT"] = environment;
        // Port 1 is deliberately not a PostgreSQL endpoint; accepted settings fail at the connection boundary.
        start.Environment["ConnectionStrings__WorkerDatabase"] = $"Host=127.0.0.1;Port=1;Database=worker_startup_test;Username=trainflow_worker;SSL Mode={sslMode};Timeout=1";
        using var process = Process.Start(start)!;
        var stdout = process.StandardOutput.ReadToEndAsync();
        var stderr = process.StandardError.ReadToEndAsync();
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(20));
        try
        {
            await process.WaitForExitAsync(timeout.Token);
        }
        finally { if (!process.HasExited) process.Kill(entireProcessTree: true); }
        var diagnostics = await stdout + await stderr;
        Assert.NotEqual(0, process.ExitCode);
        if (rejected)
        {
            Assert.Contains("SSL Mode=VerifyFull", diagnostics);
            Assert.DoesNotContain("NpgsqlException", diagnostics);
        }
        else
        {
            Assert.DoesNotContain("SSL Mode=VerifyFull", diagnostics);
            Assert.Contains("NpgsqlException", diagnostics);
        }
    }
}
