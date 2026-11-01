[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [ValidateSet('SetPasswords', 'TestLogins')]
    [string]$Mode
)

$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$psql = Join-Path $root '.local/postgresql/pgsql/bin/psql.exe'
$ca = (Join-Path $root '.local/certificates/supabase-ca.crt').Replace('\', '/')
$verification = Join-Path $PSScriptRoot 'diagnostics/production-role-access.sql'
if ([Console]::IsInputRedirected -or [Console]::IsOutputRedirected) {
    throw 'Run in your own interactive PowerShell terminal, without pipes, redirects or transcripts.'
}
foreach ($file in @($psql, $ca, $verification)) {
    if (!(Test-Path -LiteralPath $file -PathType Leaf)) { throw "Required file missing: $file" }
}
if ((& $psql --version) -notmatch '^psql \(PostgreSQL\) 17\.11$') { throw 'Expected the reviewed psql 17.11 client.' }
if ($env:PGPASSWORD -or $env:PGOPTIONS -or $env:PGSERVICE) {
    throw 'Remove PGPASSWORD, PGOPTIONS and PGSERVICE from this terminal before continuing. Their values were not printed.'
}

$previousHistory = $env:PSQL_HISTORY
try {
    # Disable psql history; -X also ignores user/system psqlrc customizations.
    $env:PSQL_HISTORY = 'NUL'
    $roles = if ($Mode -eq 'SetPasswords') { @('postgres') } else { @('trainflow_api', 'trainflow_migrator', 'trainflow_worker') }
    foreach ($role in $roles) {
        $connection = "host=aws-1-eu-central-1.pooler.supabase.com port=5432 dbname=postgres user=$role.tqkgzhtaznmymkuxjnkb sslmode=verify-full sslrootcert='$ca' passfile=NUL connect_timeout=15"
        if ($Mode -eq 'SetPasswords') {
            Write-Host 'Target: metrivum-production / tqkgzhtaznmymkuxjnkb. Enter the administrator password at the first prompt.'
            Write-Host 'After connecting, verify \conninfo, then enter these commands individually:'
            Write-Host '\password trainflow_api'
            Write-Host '\password trainflow_migrator'
            Write-Host '\password trainflow_worker'
            Write-Host '\q'
            Write-Host 'Use a different password from your password manager for each role. At each \password command enter it twice.'
            Write-Host 'Stop at any error. Do not type ALTER ROLE, migrations, grants, or plaintext passwords at the SQL prompt.'
            # Intentionally no stdin redirection, -c, -f, console automation or secret handling.
            & $psql -X -W $connection -v ON_ERROR_STOP=1
        } else {
            Write-Host "Testing $role. Enter that role's password from your password manager."
            & $psql -X -W $connection -v ON_ERROR_STOP=1 -v "expected_role=$role" -f $verification
        }
        if ($LASTEXITCODE -ne 0) { throw "psql failed for $role. Stopped without retry." }
    }
    if ($Mode -eq 'SetPasswords') {
        Write-Host 'Session closed. This script cannot certify which commands were entered. Run -Mode TestLogins next.'
    } else {
        Write-Host 'All three interactive logins and read-only permission checks passed.'
    }
} finally {
    $env:PSQL_HISTORY = $previousHistory
}
