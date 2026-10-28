#requires -Version 7.2
Set-StrictMode -Version Latest

function Assert-EquilibrioBackupDestination {
 param([string]$Destination,[string]$ProjectRoot,[string]$SourceKey)
 if(![IO.Path]::IsPathFullyQualified($Destination) -or ![IO.Directory]::Exists($Destination)){throw 'Escolhe uma pasta existente com caminho absoluto.'}
 $dest=[IO.Path]::GetFullPath($Destination).TrimEnd('\','/')
 foreach($blocked in @($ProjectRoot,[IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($SourceKey)))){
  $folder=[IO.Path]::GetFullPath($blocked).TrimEnd('\','/')
  if($dest.Equals($folder,[StringComparison]::OrdinalIgnoreCase) -or $dest.StartsWith($folder+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'O destino deve ficar fora do projeto e do cofre original.'}
 }
 for($item=[IO.DirectoryInfo]::new($dest);$null -ne $item;$item=$item.Parent){
  if($item.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Escolhe um destino direto, sem atalhos de pasta ou ligações.'}
 }
 return $dest
}

function Get-EquilibrioKeyProof {
 param([string]$Path,[Security.SecureString]$Password,[string]$ExpectedFingerprint)
 $pointer=[IntPtr]::Zero;$collection=[Security.Cryptography.X509Certificates.X509Certificate2Collection]::new();$rsa=$null;$public=$null
 try {
  if((Get-Item -LiteralPath $Path -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Linked key'}
  $pointer=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($Password)
  $plain=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  $collection.Import([IO.File]::ReadAllBytes($Path),$plain,[Security.Cryptography.X509Certificates.X509KeyStorageFlags]::EphemeralKeySet)
  $private=@($collection | Where-Object {$_.HasPrivateKey})
  if($private.Count -ne 1){throw 'Expected one private key'}
  $cert=$private[0]
  $fingerprint=[Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($cert.RawData))
  if($fingerprint -cne $ExpectedFingerprint.ToUpperInvariant()){throw 'Wrong certificate'}
  $rsa=[Security.Cryptography.X509Certificates.RSACertificateExtensions]::GetRSAPrivateKey($cert)
  $public=[Security.Cryptography.X509Certificates.RSACertificateExtensions]::GetRSAPublicKey($cert)
  if($null -eq $rsa -or $rsa.KeySize -lt 2048){throw 'Unsupported key'}
  $challenge=[Security.Cryptography.RandomNumberGenerator]::GetBytes(64)
  $signature=$rsa.SignData($challenge,[Security.Cryptography.HashAlgorithmName]::SHA256,[Security.Cryptography.RSASignaturePadding]::Pkcs1)
  if(!$public.VerifyData($challenge,$signature,[Security.Cryptography.HashAlgorithmName]::SHA256,[Security.Cryptography.RSASignaturePadding]::Pkcs1)){throw 'Private key not recoverable'}
  return [pscustomobject]@{fingerprint=$fingerprint;privateKeyVerified=$true}
 } catch {throw 'Não foi possível verificar a chave e a palavra-passe, ou o certificado não corresponde ao esperado.'}
 finally {
  $plain=$null
  if($null -ne $rsa){$rsa.Dispose()};if($null -ne $public){$public.Dispose()}
  foreach($cert in $collection){$cert.Dispose()}
  if($pointer -ne [IntPtr]::Zero){[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)}
 }
}

function Test-EquilibrioSigningBackup {
 param([string]$BackupFolder,[Security.SecureString]$Password,[string]$ExpectedFingerprint)
 $folder=(Resolve-Path -LiteralPath $BackupFolder -ErrorAction Stop).Path
 if((Get-Item -LiteralPath $folder -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'A pasta da cópia não pode ser uma ligação.'}
 $manifestPath=Join-Path $folder 'MANIFESTO.json'
 if((Get-Item -LiteralPath $manifestPath -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Manifesto ligado recusado.'}
 $manifest=Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
 if($manifest.format -ne 'equilibrio-signing-backup' -or $manifest.version -ne 1 -or $manifest.file -cne 'equilibrio-mobile.p12' -or $manifest.alias -cne 'equilibrio' -or $manifest.signerSha256 -cne $ExpectedFingerprint.ToUpperInvariant()){throw 'O manifesto não corresponde à assinatura da app.'}
 $key=Join-Path $folder 'equilibrio-mobile.p12'
 if((Get-FileHash -LiteralPath $key -Algorithm SHA256).Hash -cne $manifest.fileSha256){throw 'O ficheiro da chave foi alterado ou está incompleto.'}
 $proof=Get-EquilibrioKeyProof -Path $key -Password $Password -ExpectedFingerprint $ExpectedFingerprint
 return [pscustomobject]@{verified=$true;signerSha256=$proof.fingerprint;privateKeyVerified=$proof.privateKeyVerified;requiresOriginalWindows=$false;offComputerLocationConfirmed=$false}
}

function Export-EquilibrioSigningBackup {
 param([string]$SourceKey,[Security.SecureString]$SourcePassword,[Security.SecureString]$BackupPassword,[string]$ExpectedFingerprint,[string]$Destination,[string]$ProjectRoot,[string]$Keytool)
 $dest=Assert-EquilibrioBackupDestination -Destination $Destination -ProjectRoot $ProjectRoot -SourceKey $SourceKey
 if($BackupPassword.Length -lt 12){throw 'Usa uma nova palavra-passe com pelo menos 12 caracteres.'}
 if(!(Test-Path -LiteralPath $Keytool -PathType Leaf)){throw 'Indica o keytool do JDK instalado.'}
 $originalHash=(Get-FileHash -LiteralPath $SourceKey -Algorithm SHA256).Hash
 $null=Get-EquilibrioKeyProof -Path $SourceKey -Password $SourcePassword -ExpectedFingerprint $ExpectedFingerprint
 $folder=Join-Path $dest ('Equilibrio-chave-'+[DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss')+'-'+[Guid]::NewGuid().ToString('N'))
 if(Test-Path -LiteralPath $folder){throw 'A pasta de destino já existe.'}
 $null=[IO.Directory]::CreateDirectory($folder)
 $partial=Join-Path $folder 'equilibrio-mobile.p12.partial';$key=Join-Path $folder 'equilibrio-mobile.p12'
 $sourcePtr=[IntPtr]::Zero;$backupPtr=[IntPtr]::Zero;$process=$null;$start=$null;$success=$false
 try {
  $sourcePtr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($SourcePassword)
  $backupPtr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($BackupPassword)
  $sourcePlain=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($sourcePtr);$backupPlain=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($backupPtr)
  if($sourcePlain -ceq $backupPlain){throw 'Escolhe uma palavra-passe nova, diferente da proteção local.'}
  $start=[Diagnostics.ProcessStartInfo]::new();$start.FileName=$Keytool;$start.UseShellExecute=$false;$start.CreateNoWindow=$true;$start.RedirectStandardOutput=$true;$start.RedirectStandardError=$true
  $start.Environment['EQUILIBRIO_BACKUP_SOURCE_PASS']=$sourcePlain;$start.Environment['EQUILIBRIO_BACKUP_DEST_PASS']=$backupPlain
  foreach($arg in @('-importkeystore','-noprompt','-srckeystore',$SourceKey,'-srcstoretype','PKCS12','-srcalias','equilibrio','-srcstorepass:env','EQUILIBRIO_BACKUP_SOURCE_PASS','-srckeypass:env','EQUILIBRIO_BACKUP_SOURCE_PASS','-destkeystore',$partial,'-deststoretype','PKCS12','-destalias','equilibrio','-deststorepass:env','EQUILIBRIO_BACKUP_DEST_PASS','-destkeypass:env','EQUILIBRIO_BACKUP_DEST_PASS')){$start.ArgumentList.Add($arg)}
  $process=[Diagnostics.Process]::new();$process.StartInfo=$start;$null=$process.Start()
  $stdout=$process.StandardOutput.ReadToEndAsync();$stderr=$process.StandardError.ReadToEndAsync()
  if(!$process.WaitForExit(45000)){$process.Kill($true);$null=$process.WaitForExit(5000);throw 'A preparação da cópia excedeu o tempo previsto.'}
  $null=$stdout.GetAwaiter().GetResult();$null=$stderr.GetAwaiter().GetResult()
  if($process.ExitCode -ne 0){throw 'Não foi possível preparar a cópia portátil.'}
  $null=Get-EquilibrioKeyProof -Path $partial -Password $BackupPassword -ExpectedFingerprint $ExpectedFingerprint
  if((Get-FileHash -LiteralPath $SourceKey -Algorithm SHA256).Hash -cne $originalHash){throw 'A chave original mudou durante a operação.'}
  [IO.File]::Move($partial,$key,$false)
  $manifest=[ordered]@{format='equilibrio-signing-backup';version=1;applicationId='pt.equilibrio.mobile';alias='equilibrio';file='equilibrio-mobile.p12';fileSha256=(Get-FileHash -LiteralPath $key -Algorithm SHA256).Hash;signerSha256=$ExpectedFingerprint.ToUpperInvariant();createdUtc=[DateTime]::UtcNow.ToString('o');privateKeyChallengeVerified=$true;requiresOriginalWindows=$false;offComputerLocationConfirmed=$false}
  [IO.File]::WriteAllText((Join-Path $folder 'MANIFESTO.json'),($manifest | ConvertTo-Json),[Text.UTF8Encoding]::new($false))
  [IO.File]::WriteAllText((Join-Path $folder 'LEIA-ME.txt'),"Chave privada da app Equilibrio. Nao publicar, enviar no chat ou colocar no GitHub.`nGuardar a nova palavra-passe separadamente: nao consta nesta pasta.`nVerificar noutro PC com backup-signing-key.ps1 -BackupFolder e a palavra-passe.`nConfirmar que esta pasta esta efetivamente fora do computador original.`n",[Text.UTF8Encoding]::new($false))
  $verified=Test-EquilibrioSigningBackup -BackupFolder $folder -Password $BackupPassword -ExpectedFingerprint $ExpectedFingerprint
  $success=$true
  return [pscustomobject]@{backupFolder=$folder;verified=$verified.verified;signerSha256=$verified.signerSha256;sourceUnchanged=$true;requiresOriginalWindows=$false;offComputerLocationConfirmed=$false}
 } finally {
  $sourcePlain=$null;$backupPlain=$null
  if($null -ne $start){$null=$start.Environment.Remove('EQUILIBRIO_BACKUP_SOURCE_PASS');$null=$start.Environment.Remove('EQUILIBRIO_BACKUP_DEST_PASS')}
  if($null -ne $process){$process.Dispose()}
  foreach($pointer in @($sourcePtr,$backupPtr)){if($pointer -ne [IntPtr]::Zero){[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)}}
  if(!$success){foreach($name in @('equilibrio-mobile.p12.partial','equilibrio-mobile.p12','MANIFESTO.json','LEIA-ME.txt')){$path=Join-Path $folder $name;if(Test-Path -LiteralPath $path){Remove-Item -LiteralPath $path -Force}};if([IO.Directory]::Exists($folder) -and [IO.Directory]::GetFileSystemEntries($folder).Length -eq 0){[IO.Directory]::Delete($folder,$false)}}
 }
}
Export-ModuleMember -Function Assert-EquilibrioBackupDestination,Export-EquilibrioSigningBackup,Test-EquilibrioSigningBackup
