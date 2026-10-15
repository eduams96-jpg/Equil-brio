param([string]$AppDirectory, [string]$UserDataDirectory)
$ErrorActionPreference = 'Stop'
try {
  if (-not $AppDirectory) { $AppDirectory = Read-Host 'Pasta onde esta instalado o Financas Pessoais (contem o programa .exe)' }
  $taskInstall = (Resolve-Path -LiteralPath $AppDirectory.Trim('"')).Path
  $taskApp = Join-Path $taskInstall 'resources\app'
  if (-not (Test-Path -LiteralPath (Join-Path $taskApp 'package.json'))) { throw 'Esta pasta nao contem resources\app\package.json.' }
  $taskRunning = Get-Process | Where-Object { $_.Path -and $_.Path.StartsWith($taskInstall + '\', [StringComparison]::OrdinalIgnoreCase) }
  if ($taskRunning) { throw 'Fecha a aplicacao antes de atualizar e volta a executar este ficheiro.' }
  $taskExe = Get-ChildItem -LiteralPath $taskInstall -File -Filter '*.exe' | Where-Object Name -NotMatch 'unins|setup|crashpad|crash_handler' | Select-Object -First 1
  if (-not $taskExe) { throw 'O executavel da aplicacao nao foi encontrado.' }
  $taskUpdate = Get-ChildItem -LiteralPath $PSScriptRoot -File -Filter '*.fpupdate'
  if (@($taskUpdate).Count -ne 1) { throw 'Coloca apenas o .fpupdate desta versao junto deste script.' }
  $taskProfile = if ($UserDataDirectory) { [IO.Path]::GetFullPath($UserDataDirectory) } else { Join-Path ([Environment]::GetFolderPath('ApplicationData')) 'Financas Pessoais' }
  $taskPreviousElectronMode = $env:ELECTRON_RUN_AS_NODE
  try {
    $env:ELECTRON_RUN_AS_NODE = '1'
    # Electron is a GUI executable: explicitly wait for its actual exit code.
    $taskArguments = @((Join-Path $PSScriptRoot 'scripts\apply-update-from-zip.cjs'), $taskApp, $taskProfile, $taskUpdate.FullName) | ForEach-Object { '"' + $_ + '"' }
    $taskLog = Join-Path ([IO.Path]::GetTempPath()) ('equilibrio-update-' + [Guid]::NewGuid().ToString() + '.log')
    $taskErrorLog = $taskLog + '.stderr'
    $taskProcess = Start-Process -FilePath $taskExe.FullName -ArgumentList $taskArguments -Wait -PassThru -WindowStyle Hidden -RedirectStandardOutput $taskLog -RedirectStandardError $taskErrorLog
    if ($taskProcess.ExitCode -ne 0) {
      if (Test-Path -LiteralPath $taskErrorLog) { Get-Content -LiteralPath $taskErrorLog | Write-Host }
      throw 'A atualizacao falhou. Consulta a mensagem acima; os dados nao foram substituidos.'
    }
    Get-Content -LiteralPath $taskLog | Write-Host
  } finally { $env:ELECTRON_RUN_AS_NODE = $taskPreviousElectronMode }
  Write-Host 'Atualizacao concluida. Podes voltar a abrir o programa.'
} catch { Write-Host $_.Exception.Message; exit 1 }
