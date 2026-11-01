param([string]$OutputPath = '.local/mcp-upgrade.sql', [string]$Configuration = 'Debug', [switch]$NoBuild)
$ErrorActionPreference = 'Stop'
$root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
Push-Location $root
try {
    $parts = Join-Path $root '.local/mcp-export'
    New-Item -ItemType Directory -Force $parts | Out-Null
    $sql = [Collections.Generic.List[string]]::new()
    $sql.Add(@'
-- Development upgrade only; inspect the exact target and EF histories before applying.
BEGIN;
DO $$ BEGIN
    IF NOT EXISTS (SELECT FROM access."__EFMigrationsHistory" WHERE "MigrationId"='20261008135032_StageFiveFeatures')
       OR to_regnamespace('integrations') IS NOT NULL THEN
        RAISE EXCEPTION 'Unexpected MCP baseline: inspect target and history';
    END IF;
END $$;
CREATE SCHEMA integrations AUTHORIZATION trainflow_migrator;
SET LOCAL ROLE trainflow_migrator;
REVOKE ALL ON SCHEMA integrations FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA integrations REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA integrations REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
'@)
    foreach ($module in @('Integrations', 'Access')) {
        $part = Join-Path $parts "$module.sql"
        $arguments = @('ef', 'migrations', 'script', '--no-transactions', '--configuration', $Configuration,
            '--project', "backend/modules/$module/Metrivum.$module", '--context', "$($module)DbContext", '--output', $part)
        if ($NoBuild) { $arguments += '--no-build' }
        if ($module -eq 'Access') { $arguments += @('20261008135032_StageFiveFeatures', '20261014160000_IntegrationFeatures') }
        & dotnet @arguments
        if ($LASTEXITCODE -ne 0) { throw "$module migration export failed." }
        $sql.Add([IO.File]::ReadAllText($part))
    }
    $sql.Add([IO.File]::ReadAllText((Join-Path $root 'infra/runtime-grants.sql')))
    $sql.Add("RESET ROLE;`nCOMMIT;")
    $output = [IO.Path]::GetFullPath($OutputPath)
    New-Item -ItemType Directory -Force (Split-Path $output -Parent) | Out-Null
    [IO.File]::WriteAllText($output, ($sql -join "`n"), [Text.UTF8Encoding]::new($false))
    Write-Output $output
}
finally { Pop-Location }
