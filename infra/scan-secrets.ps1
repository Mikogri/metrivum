param([switch]$IncludeHistory, [string[]]$ArtifactRoots = @())
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
Push-Location $root
try {
    $tracked = @(git -c core.quotepath=false ls-files --cached)
    $files = @(git -c core.quotepath=false ls-files --cached --others --exclude-standard | Sort-Object -Unique)
    $forbidden = $tracked | Where-Object { ($_ -match '(^|/)(\.env(\..*)?|appsettings\.Local\.json)$' -and $_ -notmatch '(^|/)\.env\.example$') -or $_ -match '\.(pfx|p12|jks|keystore)$' }
    if ($forbidden) { throw "Local secret configuration is tracked: $($forbidden -join ', ')" }
    foreach ($artifact in $ArtifactRoots) {
        if (!(Test-Path -LiteralPath $artifact -PathType Container)) { throw 'The requested artifact directory is missing.' }
        $bundles = @(Get-ChildItem -LiteralPath $artifact -File -Recurse | Where-Object { $_.Extension -in '.js','.json','.map','.html','.css','.txt' })
        if ($bundles.Name -contains 'appsettings.Local.json') { throw 'Machine-local settings found in build artifacts.' }
        $files += $bundles.FullName
    }
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
    if ($IncludeHistory) {
        if ((git rev-parse --is-shallow-repository) -eq 'true') { throw 'Fetch full Git history before running the history secret scan.' }
        foreach ($pattern in $patterns) {
            # Print identities/paths only. Never print patches or matching secret values.
            $hits = @(git --no-pager log --all --format='%H' --name-only "-G$pattern" -- .)
            if ($LASTEXITCODE -ne 0) { throw 'Git history scan failed.' }
            if ($hits.Count -gt 0) { throw "Possible historical secret; review/rotate privately. Commits/paths: $($hits -join ', ')" }
        }
        Write-Output 'Secret-pattern history scan passed for all locally available refs.'
    }
    Write-Output "Secret-pattern checks passed for $($files.Count) tracked/untracked source files; tracked private configuration checks passed. Ignored local files require a separate audit; use -IncludeHistory and -ArtifactRoots for their explicit scopes."
}
finally { Pop-Location }
