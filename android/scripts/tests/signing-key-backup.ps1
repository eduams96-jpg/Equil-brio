#requires -Version 7.2
param([string]$JavaHome=$env:JAVA_HOME,[string]$ReportDirectory)
$ErrorActionPreference='Stop'
if(!$IsWindows){throw 'Este ensaio usa junctions e exige Windows.'}
$project=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'))
$module=Join-Path $project 'android/scripts/signing-key-backup.psm1'
Import-Module $module -Force
$keytool=if($JavaHome){Join-Path $JavaHome 'bin/keytool.exe'}else{''}
if(!$keytool -or !(Test-Path -LiteralPath $keytool -PathType Leaf)){throw 'Indica JavaHome ou JAVA_HOME para o JDK instalado.'}
$report=if($ReportDirectory){[IO.Path]::GetFullPath($ReportDirectory)}else{Join-Path $project 'coordenacao/relatorios/FECHO-002'}
$null=[IO.Directory]::CreateDirectory($report)
$root=Join-Path ([IO.Path]::GetTempPath()) ('Equilibrio-fecho002-'+[Guid]::NewGuid().ToString('N'))
$sourceDir=Join-Path $root 'source';$destination=Join-Path $root 'destination';$protected=Join-Path $root 'project';$link=Join-Path $root 'linked'
foreach($folder in @($sourceDir,$destination,$protected)){$null=[IO.Directory]::CreateDirectory($folder)}
$source=Join-Path $sourceDir 'synthetic.p12'
$sourcePlain='Source-'+[Guid]::NewGuid().ToString('N');$backupPlain='Portable-'+[Guid]::NewGuid().ToString('N')
$sourcePassword=ConvertTo-SecureString $sourcePlain -AsPlainText -Force;$backupPassword=ConvertTo-SecureString $backupPlain -AsPlainText -Force
$checks=[Collections.Generic.List[string]]::new()
function Check([string]$Name,[scriptblock]$Action){& $Action;$checks.Add($Name)}
function Refuses([scriptblock]$Action){$failed=$false;try{& $Action | Out-Null}catch{$failed=$true};if(!$failed){throw 'Expected refusal'}}
function Tool([string[]]$Arguments,[string]$Password){
 $s=[Diagnostics.ProcessStartInfo]::new();$s.FileName=$keytool;$s.UseShellExecute=$false;$s.CreateNoWindow=$true;$s.RedirectStandardOutput=$true;$s.RedirectStandardError=$true;$s.Environment['QA_KEY_PASS']=$Password
 foreach($arg in $Arguments){$s.ArgumentList.Add($arg)}
 $p=[Diagnostics.Process]::new();$p.StartInfo=$s;$null=$p.Start();$out=$p.StandardOutput.ReadToEndAsync();$err=$p.StandardError.ReadToEndAsync();$p.WaitForExit();$text=$out.GetAwaiter().GetResult();$null=$err.GetAwaiter().GetResult();if($p.ExitCode -ne 0){throw 'Synthetic keytool command failed'};$p.Dispose();return $text
}
try{
 $null=Tool -Arguments @('-genkeypair','-alias','equilibrio','-keyalg','RSA','-keysize','2048','-validity','2','-dname','CN=Equilibrio synthetic QA only','-storetype','PKCS12','-keystore',$source,'-storepass:env','QA_KEY_PASS','-keypass:env','QA_KEY_PASS','-noprompt') -Password $sourcePlain
 $certText=Tool -Arguments @('-exportcert','-rfc','-alias','equilibrio','-keystore',$source,'-storepass:env','QA_KEY_PASS') -Password $sourcePlain
 $body=$certText -replace '-----BEGIN CERTIFICATE-----|-----END CERTIFICATE-----|\s',''
 $fingerprint=[Convert]::ToHexString([Security.Cryptography.SHA256]::HashData([Convert]::FromBase64String($body)))
 $before=(Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash
 $options=@{SourceKey=$source;SourcePassword=$sourcePassword;BackupPassword=$backupPassword;ExpectedFingerprint=$fingerprint;Destination=$destination;ProjectRoot=$protected;Keytool=$keytool}
 $result=Export-EquilibrioSigningBackup @options
 Check 'Export re-encrypts a synthetic private key and preserves the original' {if(!$result.verified -or (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash -ne $before){throw 'Export failure'}}
 $volumeRoot=[IO.Path]::GetPathRoot($root)
 Check 'Drive root remains absolute rather than becoming a drive-relative path' {$resolved=Assert-EquilibrioBackupDestination -Destination $volumeRoot -ProjectRoot $protected -SourceKey $source;if($resolved -cne $volumeRoot){throw 'Drive root changed'}}
 Check 'A drive-relative destination is refused' {Refuses {Assert-EquilibrioBackupDestination -Destination $volumeRoot.TrimEnd('\') -ProjectRoot $protected -SourceKey $source}}
 Check 'A protected whole-volume root blocks its descendants' {Refuses {Assert-EquilibrioBackupDestination -Destination $destination -ProjectRoot $volumeRoot -SourceKey $source}}
 $aliasText=Tool -Arguments @('-list','-alias','equilibrio','-keystore',(Join-Path $result.backupFolder 'equilibrio-mobile.p12'),'-storepass:env','QA_KEY_PASS') -Password $backupPlain
 Check 'Gradle signing alias equilibrio is preserved' {if(!$aliasText){throw 'Alias missing'}}
 Check 'Portable password verifies actual private-key signing and certificate' {$proof=Test-EquilibrioSigningBackup -BackupFolder $result.backupFolder -Password $backupPassword -ExpectedFingerprint $fingerprint;if(!$proof.privateKeyVerified -or $proof.requiresOriginalWindows){throw 'Proof failed'}}
 $wrong=ConvertTo-SecureString 'Wrong-password-for-test' -AsPlainText -Force
 Check 'Wrong password cannot verify the backup' {Refuses {Test-EquilibrioSigningBackup -BackupFolder $result.backupFolder -Password $wrong -ExpectedFingerprint $fingerprint}}
 Check 'An unrelated certificate cannot pass the release fingerprint check' {Refuses {Test-EquilibrioSigningBackup -BackupFolder $result.backupFolder -Password $backupPassword -ExpectedFingerprint ('0'*64)}}
 $key=Join-Path $result.backupFolder 'equilibrio-mobile.p12';$original=[IO.File]::ReadAllBytes($key);$changed=[byte[]]$original.Clone();$changed[30]=$changed[30] -bxor 1;[IO.File]::WriteAllBytes($key,$changed)
 Check 'Modified PKCS12 is refused before recovery' {Refuses {Test-EquilibrioSigningBackup -BackupFolder $result.backupFolder -Password $backupPassword -ExpectedFingerprint $fingerprint}}
 [IO.File]::WriteAllBytes($key,$original)
 $manifestPath=Join-Path $result.backupFolder 'MANIFESTO.json';$manifest=[IO.File]::ReadAllText($manifestPath);$bad=$manifest | ConvertFrom-Json;$bad.file='../source/synthetic.p12';[IO.File]::WriteAllText($manifestPath,($bad | ConvertTo-Json))
 Check 'Manifest path traversal is refused' {Refuses {Test-EquilibrioSigningBackup -BackupFolder $result.backupFolder -Password $backupPassword -ExpectedFingerprint $fingerprint}}
 [IO.File]::WriteAllText($manifestPath,$manifest)
 Check 'Export inside project is refused' {$bad=$options.Clone();$bad.Destination=$protected;Refuses {Export-EquilibrioSigningBackup @bad}}
 Check 'Export beside the original key is refused' {$bad=$options.Clone();$bad.Destination=$sourceDir;Refuses {Export-EquilibrioSigningBackup @bad}}
 Check 'A short portable password is refused' {$bad=$options.Clone();$bad.BackupPassword=ConvertTo-SecureString 'short' -AsPlainText -Force;Refuses {Export-EquilibrioSigningBackup @bad}}
 Check 'Reusing the locally protected password is refused' {$bad=$options.Clone();$bad.BackupPassword=$sourcePassword;Refuses {Export-EquilibrioSigningBackup @bad}}
 $null=New-Item -ItemType Junction -Path $link -Target $destination
 Check 'A linked destination is refused without following it' {$bad=$options.Clone();$bad.Destination=$link;Refuses {Export-EquilibrioSigningBackup @bad}}
 Remove-Item -LiteralPath $link -Force
 $worker=Join-Path $root 'verify-independent.ps1'
 [IO.File]::WriteAllText($worker,(@'
param($Module,$Folder,$Fingerprint)
$ErrorActionPreference='Stop'
Import-Module $Module -Force
$password=ConvertTo-SecureString $env:QA_PORTABLE_PASSWORD -AsPlainText -Force
$proof=Test-EquilibrioSigningBackup -BackupFolder $Folder -Password $password -ExpectedFingerprint $Fingerprint
if(!$proof.privateKeyVerified -or $proof.requiresOriginalWindows){throw 'Not portable'}
'@))
 Remove-Item -LiteralPath $source -Force
 $start=[Diagnostics.ProcessStartInfo]::new();$start.FileName=(Get-Process -Id $PID).Path;$start.UseShellExecute=$false;$start.CreateNoWindow=$true;$start.RedirectStandardOutput=$true;$start.RedirectStandardError=$true;$start.Environment['QA_PORTABLE_PASSWORD']=$backupPlain
 foreach($arg in @('-NoProfile','-NonInteractive','-File',$worker,$module,$result.backupFolder,$fingerprint)){$start.ArgumentList.Add($arg)}
 $p=[Diagnostics.Process]::new();$p.StartInfo=$start;$null=$p.Start();$out=$p.StandardOutput.ReadToEndAsync();$err=$p.StandardError.ReadToEndAsync();$p.WaitForExit();$null=$out.GetAwaiter().GetResult();$failure=$err.GetAwaiter().GetResult()
 Check 'A separate process recovers the key without original file or DPAPI' {if($p.ExitCode -ne 0){throw ('Independent verification failed: '+$failure)}}
 $p.Dispose()
 Check 'No password or local protection file is stored with backup' {$files=@(Get-ChildItem -LiteralPath $result.backupFolder -File);if($files.Count -ne 3){throw 'Unexpected files'};foreach($file in $files | Where-Object {$_.Extension -ne '.p12'}){$text=[IO.File]::ReadAllText($file.FullName);if($text.Contains($sourcePlain) -or $text.Contains($backupPlain) -or $text.Contains('password.dpapi')){throw 'Secret in backup metadata'}}}
 $proof=[ordered]@{passed=$true;checks=$checks;count=$checks.Count;onlySyntheticKeyUsed=$true;productionKeyRead=$false;productionKeyExported=$false;independentProcessVerified=$true;originalAbsentDuringVerification=$true;offComputerCopyPerformed=$false;applicationArtifactsChanged=$false}
 [IO.File]::WriteAllText((Join-Path $report 'VERIFICACAO-CHAVE-SINTETICA.json'),($proof | ConvertTo-Json -Depth 5),[Text.UTF8Encoding]::new($false))
 Write-Output ($proof | ConvertTo-Json -Depth 5 -Compress)
}finally{
 if(Test-Path -LiteralPath $link){Remove-Item -LiteralPath $link -Force}
 $resolved=[IO.Path]::GetFullPath($root)
 if(!$resolved.StartsWith([IO.Path]::GetFullPath([IO.Path]::GetTempPath()),[StringComparison]::OrdinalIgnoreCase) -or !([IO.Path]::GetFileName($resolved)).StartsWith('Equilibrio-fecho002-')){throw 'Unsafe temporary cleanup'}
 if(Test-Path -LiteralPath $resolved){if(@(Get-ChildItem -LiteralPath $resolved -Recurse -Force | Where-Object {$_.Attributes -band [IO.FileAttributes]::ReparsePoint}).Count){throw 'Linked temporary descendant'};Remove-Item -LiteralPath $resolved -Recurse -Force}
 $sourcePassword.Dispose();$backupPassword.Dispose();$sourcePlain=$null;$backupPlain=$null
}
