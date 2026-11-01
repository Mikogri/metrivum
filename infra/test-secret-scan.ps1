$ErrorActionPreference = 'Stop'
$workspace = Split-Path $PSScriptRoot -Parent
$temporary = Join-Path $workspace ('.local/secret-scan-test-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path (Join-Path $temporary 'infra') -Force | Out-Null
try {
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'scan-secrets.ps1') -Destination (Join-Path $temporary 'infra/scan-secrets.ps1')
    Push-Location $temporary
    try {
        git init --quiet
        git config user.name 'Security regression fixture'
        git config user.email 'fixture@example.invalid'
        $fixture = 'sb_' + 'secret_' + ('x' * 36)
        Set-Content -LiteralPath example.txt -Value $fixture
        git add .
        git commit --quiet -m 'Synthetic secret fixture'
        Set-Content -LiteralPath example.txt -Value 'Removed from current tree'
        git add .
        git commit --quiet -m 'Clean current fixture'
        & (Join-Path $temporary 'infra/scan-secrets.ps1') | Out-Null
        $rejected = $false
        try { & (Join-Path $temporary 'infra/scan-secrets.ps1') -IncludeHistory | Out-Null }
        catch {
            if ($_.ToString().Contains($fixture)) { throw 'Secret scanner exposed the matched value.' }
            if ($_.ToString() -notmatch 'historical secret') { throw }
            $rejected = $true
        }
        if (!$rejected) { throw 'A removed historical secret was not detected.' }
        Write-Output 'Secret scan regression passed: removed historical fixture detected; matched value redacted.'
    } finally { Pop-Location }
} finally {
    $resolved = [IO.Path]::GetFullPath($temporary)
    $allowed = [IO.Path]::GetFullPath((Join-Path $workspace '.local')) + [IO.Path]::DirectorySeparatorChar
    if (!$resolved.StartsWith($allowed, [StringComparison]::OrdinalIgnoreCase)) { throw 'Unexpected cleanup target.' }
    Remove-Item -LiteralPath $resolved -Recurse -Force
}
