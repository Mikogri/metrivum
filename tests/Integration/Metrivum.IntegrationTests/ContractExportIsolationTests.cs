using System.Diagnostics;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

namespace Metrivum.IntegrationTests;

public sealed class ContractExportIsolationTests
{
    [Fact]
    public void Build_outputs_do_not_include_machine_local_credentials()
    {
        Assert.False(File.Exists(Path.Combine(AppContext.BaseDirectory, "appsettings.Local.json")));
        Assert.False(
            File.Exists(
                Path.Combine(
                    Path.GetDirectoryName(typeof(Program).Assembly.Location)!,
                    "appsettings.Local.json"
                )
            )
        );
    }

    [Fact]
    public void Testing_host_has_no_business_background_workers()
    {
        using var factory = new ApiFactory();
        using var client = factory.CreateClient();
        Assert.DoesNotContain(
            factory.Services.GetServices<IHostedService>(),
            service =>
                service.GetType().Namespace?.StartsWith("Metrivum", StringComparison.Ordinal)
                == true
        );
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Export_ignores_local_settings_and_deployment_configuration(
        bool simultaneousMigration
    )
    {
        var directory = Path.Combine(
            Path.GetTempPath(),
            "trainflow-export-" + Guid.NewGuid().ToString("N")
        );
        Directory.CreateDirectory(directory);
        try
        {
            // Invalid JSON proves appsettings.Local.json is not loaded at all.
            await File.WriteAllTextAsync(
                Path.Combine(directory, "appsettings.Local.json"),
                "invalid-json"
            );
            var start = new ProcessStartInfo("dotnet")
            {
                WorkingDirectory = directory,
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
            };
            start.ArgumentList.Add(typeof(Program).Assembly.Location);
            start.ArgumentList.Add("--export-contracts");
            if (simultaneousMigration)
                start.ArgumentList.Add("--migrate");
            start.Environment["ASPNETCORE_ENVIRONMENT"] = "Production";
            start.Environment["DOTNET_ENVIRONMENT"] = "Production";
            start.Environment["ConnectionStrings__Database"] = "invalid-connection-string";
            start.Environment["ConnectionStrings__MigrationDatabase"] = "invalid-connection-string";
            start.Environment["Supabase__Auth__ProjectUrl"] = "invalid-url";
            start.Environment["CheckIns__Worker__Enabled"] = "true";
            start.Environment["Workers__Enabled"] = "true";
            start.Environment["TRAINFLOW_CONTRACT_OUTPUT"] = directory;
            using var process = Process.Start(start)!;
            var stdout = process.StandardOutput.ReadToEndAsync();
            var stderr = process.StandardError.ReadToEndAsync();
            using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(45));
            try
            {
                await process.WaitForExitAsync(timeout.Token);
            }
            finally
            {
                if (!process.HasExited)
                    process.Kill(entireProcessTree: true);
            }
            var diagnostics = await stdout + await stderr;
            if (simultaneousMigration)
            {
                Assert.NotEqual(0, process.ExitCode);
                Assert.Contains("separate operations", diagnostics);
                Assert.False(File.Exists(Path.Combine(directory, "openapi.json")));
            }
            else
            {
                Assert.True(process.ExitCode == 0, diagnostics);
                Assert.Contains(
                    "/api/v1/training/progress",
                    await File.ReadAllTextAsync(Path.Combine(directory, "openapi.json"))
                );
                Assert.DoesNotContain("NpgsqlException", diagnostics);
            }
        }
        finally
        {
            Directory.Delete(directory, recursive: true);
        }
    }
}
