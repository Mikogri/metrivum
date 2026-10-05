$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
Push-Location $root
try {
    $files = git ls-files --cached
    $forbidden = $files | Where-Object { $_ -match '(^|/)(\.env(\..*)?|appsettings\.Local\.json)$' -and $_ -notmatch '(^|/)\.env\.example$' }
    if ($forbidden) { throw "Local secret configuration is tracked: $($forbidden -join ', ')" }
    $patterns = @(
        'sb_secret_[A-Za-z0-9_-]{16,}',
        '(ghp|gho|github_pat)_[A-Za-z0-9_]{30,}',
        '-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----',
        'eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{20,}'
    )
    $findings = @()
    foreach ($file in $files) {
        if ($file -match '\.(ttf|png|pdf)$') { continue }
        $content = Get-Content -LiteralPath $file -Raw
        foreach ($pattern in $patterns) {
            if ($content -match $pattern) { $findings += $file; break }
        }
    }
    if ($findings) { throw "Possible secrets detected in: $($findings -join ', '). Values omitted." }
    Write-Output 'Secret-pattern and tracked-configuration checks passed.'
}
finally { Pop-Location }
