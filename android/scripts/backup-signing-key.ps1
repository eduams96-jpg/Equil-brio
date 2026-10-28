#requires -Version 7.2
[CmdletBinding(DefaultParameterSetName='Export')]
param(
 [Parameter(Mandatory,ParameterSetName='Export')][string]$Destination,
 [Parameter(Mandatory,ParameterSetName='Verify')][string]$BackupFolder,
 [Parameter(ParameterSetName='Export')][string]$JavaHome=$env:JAVA_HOME
)
$ErrorActionPreference='Stop'
Import-Module (Join-Path $PSScriptRoot 'signing-key-backup.psm1') -Force
$expected='59EEA9BDE3B678FE76C42D867E9C6D5E1EB22708D25A925B8C0AD6A6E7FB4C65'
if($PSCmdlet.ParameterSetName -eq 'Verify'){
 $password=Read-Host 'Palavra-passe da copia portatil' -AsSecureString
 try{
  $null=Test-EquilibrioSigningBackup -BackupFolder $BackupFolder -Password $password -ExpectedFingerprint $expected
  Write-Host 'Verificacao concluida: palavra-passe, certificado e chave privada corretos. Esta copia nao depende do Windows original.'
  Write-Host 'Confirma que o local onde a guardaste esta efetivamente fora do computador original.'
 }finally{$password.Dispose()}
 exit
}
if(!$IsWindows){throw 'A exportacao do cofre local exige o Windows original. A verificacao da copia e independente.'}
$project=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$private=Join-Path $env:USERPROFILE '.codex/private/equilibrio/android-release'
$key=Join-Path $private 'equilibrio-mobile.p12'
$null=Assert-EquilibrioBackupDestination -Destination $Destination -ProjectRoot $project -SourceKey $key
if(!$JavaHome -or !(Test-Path -LiteralPath (Join-Path $JavaHome 'bin/keytool.exe'))){throw 'Indica JavaHome ou JAVA_HOME para o JDK instalado.'}
if(!(Test-Path -LiteralPath $key) -or !(Test-Path -LiteralPath (Join-Path $private 'password.dpapi'))){throw 'Falta a chave existente ou a sua protecao local. Nao criar uma chave nova.'}
$password=$null;$confirmation=$null;$source=$null;$one=[IntPtr]::Zero;$two=[IntPtr]::Zero
try{
 $password=Read-Host 'Nova palavra-passe para guardar separadamente (minimo 12 caracteres)' -AsSecureString
 $confirmation=Read-Host 'Repete a nova palavra-passe' -AsSecureString
 $one=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($password);$two=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($confirmation)
 if([Runtime.InteropServices.Marshal]::PtrToStringBSTR($one) -cne [Runtime.InteropServices.Marshal]::PtrToStringBSTR($two)){throw 'As palavras-passe nao coincidem.'}
 $source=(Get-Content -LiteralPath (Join-Path $private 'password.dpapi') -Raw).Trim() | ConvertTo-SecureString
 $result=Export-EquilibrioSigningBackup -SourceKey $key -SourcePassword $source -BackupPassword $password -ExpectedFingerprint $expected -Destination $Destination -ProjectRoot $project -Keytool (Join-Path $JavaHome 'bin/keytool.exe')
 Write-Host ('Copia criada em: '+$result.backupFolder)
 Write-Host 'A chave privada foi verificada e o original foi preservado.'
 Write-Host 'Copia preparada e verificada. Falta confirmar a guarda fora deste PC e verificar nesse destino. A palavra-passe fica guardada por ti, separadamente.'
}finally{
 foreach($pointer in @($one,$two)){if($pointer -ne [IntPtr]::Zero){[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)}}
 foreach($secure in @($password,$confirmation,$source)){if($null -ne $secure){$secure.Dispose()}}
}
