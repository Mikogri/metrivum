$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
Push-Location $root
try {
    $tracked = @(git -c core.quotepath=false ls-files --cached)
    $files = @(git -c core.quotepath=false ls-files --cached --others --exclude-standard | Sort-Object -Unique)
    $forbidden = $tracked | Where-Object { ($_ -match '(^|/)(\.env(\..*)?|appsettings\.Local\.json)$' -and $_ -notmatch '(^|/)\.env\.example$') -or $_ -match '\.(pfx|p12|jks|keystore)$' }
    if ($forbidden) { throw "Local secret configuration is tracked: $($forbidden -join ', ')" }
    $patterns = @(
        'sb_secret_[A-Za-z0-9_-]{16,}',
        '(ghp|gho|github_pat)_[A-Za-z0-9_]{30,}',
        'AKIA[A-Z0-9]{16}',
        'sk-(proj-|ant-)?[A-Za-z0-9_-]{32,}',
        '-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----',
        'eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{20,}'
    )
    $findings = @()
    foreach ($file in $files) {
        if (!(Test-Path -LiteralPath $file -PathType Leaf) -or $file -match '\.(ttf|png|jpe?g|gif|webp|pdf|zip|mp4|mov|wav)$') { continue }
        $content = Get-Content -LiteralPath $file -Raw
        foreach ($pattern in $patterns) {
            if ($content -match $pattern) { $findings += $file; break }
        }
    }
    if ($findings) { throw "Possible secrets detected in: $($findings -join ', '). Values omitted." }
    Write-Output "Secret-pattern checks passed for $($files.Count) tracked/untracked source files; tracked private configuration checks passed. Ignored local files and Git history require a separate audit."
}
finally { Pop-Location }
