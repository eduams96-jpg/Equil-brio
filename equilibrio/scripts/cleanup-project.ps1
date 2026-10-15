param([switch]$Apply)
$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$appRoot = Join-Path $projectRoot 'equilibrio'
$history = Join-Path $projectRoot 'historico'
$actions = [Collections.Generic.List[object]]::new()
$freed = 0L
function Check-Target([string]$target) {
    $absolute = [IO.Path]::GetFullPath($target)
    if (-not $absolute.StartsWith($projectRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw "Target outside project: $absolute" }
    if ($absolute -eq (Join-Path $projectRoot 'sources') -or $absolute.StartsWith((Join-Path $projectRoot 'sources') + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Synced sources are read-only' }
    return $absolute
}
function Move-Safe([string]$from, [string]$to) {
    $from = Check-Target $from; $to = Check-Target $to
    if (-not (Test-Path -LiteralPath $from)) { return }
    if (Test-Path -LiteralPath $to) { throw "Archive already exists: $to" }
    $actions.Add(@{action='archive';from=$from;to=$to})
    if ($Apply) { New-Item -ItemType Directory -Path (Split-Path -Parent $to) -Force | Out-Null; Move-Item -LiteralPath $from -Destination $to }
}
function Remove-Safe([string]$target) {
    $target = Check-Target $target
    if (-not (Test-Path -LiteralPath $target)) { return }
    $item = Get-Item -LiteralPath $target
    $files = if ($item.PSIsContainer) { @(Get-ChildItem -LiteralPath $target -File -Recurse) } else { @($item) }
    if ($files | Where-Object { $_.Extension -in '.db','.sqlite','.sqlite3','.pem','.key','.fpbackup' }) { throw "Potential personal data/key in disposable target: $target" }
    $size = [long](($files | Measure-Object Length -Sum).Sum)
    $actions.Add(@{action='remove-disposable';path=$target;bytes=$size})
    $script:freed += $size
    if ($Apply) { Remove-Item -LiteralPath $target -Recurse -Force }
}
# Historical comparisons and update-chain tests still depend on these versions.
$keep = @('0.39.51','0.39.52','0.39.53','0.39.58','0.39.61','0.39.65','0.39.66')
foreach ($dir in Get-ChildItem -LiteralPath $projectRoot -Directory -Filter 'baseline-*') {
    $version = $dir.Name.Substring(9)
    $package = Get-Content -LiteralPath (Join-Path $dir.FullName 'package.json') -Raw | ConvertFrom-Json
    if ($package.version -ne $version) { throw "Baseline version mismatch: $($dir.FullName)" }
    if ($version -in $keep) { Move-Safe $dir.FullName (Join-Path $history "baselines/$($dir.Name)") }
    else { Remove-Safe $dir.FullName }
}
foreach ($dir in Get-ChildItem -LiteralPath $projectRoot -Directory -Filter 'entrega-v*') {
    if ($dir.Name -notin 'entrega-v0.39.66','entrega-v0.39.67') { Move-Safe $dir.FullName (Join-Path $history "atualizacoes/$($dir.Name)") }
}
foreach ($file in Get-ChildItem -LiteralPath $appRoot -File) {
    if ($file.Name -match '^(DESKTOP|AUDITORIA|REVISAO|PROPOSTAS-VISUAIS)-v' -and $file.Name -notmatch 'v0\.39\.(66|67)\.md$') { Move-Safe $file.FullName (Join-Path $history "documentacao/$($file.Name)") }
    elseif ($file.Extension -eq '.log' -or $file.Name -in 'css-audit-03952.json','css-cleanup-03952.json') { Remove-Safe $file.FullName }
    elseif ($file.Extension -eq '.fpupdate' -and $file.Name -notmatch 'v0\.39\.(66|67)\.fpupdate$') {
        $version = [regex]::Match($file.Name,'v(0\.\d+\.\d+)').Groups[1].Value
        $saved = Join-Path $history "atualizacoes/entrega-v$version/$($file.Name)"
        if ((Test-Path -LiteralPath $saved) -and (Get-FileHash -LiteralPath $file.FullName).Hash -eq (Get-FileHash -LiteralPath $saved).Hash) { Remove-Safe $file.FullName }
        else { Move-Safe $file.FullName (Join-Path $history "atualizacoes/pacotes/$($file.Name)") }
    }
}
$dist = Join-Path $appRoot 'dist-desktop'
if (Test-Path -LiteralPath $dist) {
    $version = (Get-Content -LiteralPath (Join-Path $dist 'win-unpacked/resources/app/package.json') -Raw | ConvertFrom-Json).version
    if ($version -ne '0.39.59') { throw 'Unexpected distribution; retained' }
    if (Get-Process | Where-Object { $_.Path -and $_.Path.StartsWith($dist+'\',[StringComparison]::OrdinalIgnoreCase) }) { throw 'Distribution is running; retained' }
    Remove-Safe $dist
}
$duplicateRuntime = Join-Path $projectRoot 'test-runtime'
if (Test-Path -LiteralPath $duplicateRuntime) {
    $first = Join-Path $duplicateRuntime 'electron/electron.exe'
    $second = Join-Path $appRoot 'node_modules/electron/dist/electron.exe'
    if ((Get-FileHash -LiteralPath $first).Hash -ne (Get-FileHash -LiteralPath $second).Hash) { throw 'Runtime differs; retained' }
    Remove-Safe $duplicateRuntime
}
foreach ($dir in Get-ChildItem -LiteralPath (Join-Path $appRoot 'validacao') -Directory) {
    if ($dir.Name -notin 'release-03966','release-03967','response-03967') { Remove-Safe $dir.FullName }
}
Move-Safe (Join-Path $appRoot 'scripts/consolidate-validation.cjs') (Join-Path $history 'ferramentas/consolidate-validation-03959.cjs')
$report = @{applied=[bool]$Apply;freedBytes=$freed;freedMB=[math]::Round($freed/1MB,1);actions=$actions;retainedBaselines=$keep;sourcesUntouched=$true;personalDataUntouched=$true}
if ($Apply) { $report | ConvertTo-Json -Depth 7 | Set-Content -LiteralPath (Join-Path $projectRoot 'LIMPEZA-v0.39.67.json') -Encoding utf8 }
$report | Select-Object applied,freedMB,sourcesUntouched,personalDataUntouched | ConvertTo-Json
