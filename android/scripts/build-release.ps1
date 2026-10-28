param([string]$JavaHome=$env:JAVA_HOME,[string]$AndroidSdk=$env:ANDROID_HOME)
$ErrorActionPreference='Stop'
if(!$JavaHome -or !(Test-Path -LiteralPath (Join-Path $JavaHome 'bin/java.exe'))){throw 'Indica JAVA_HOME (JDK 21) ou o parametro JavaHome.'}
if(!$AndroidSdk -or !(Test-Path -LiteralPath (Join-Path $AndroidSdk 'platforms'))){throw 'Indica ANDROID_HOME ou o parametro AndroidSdk para o SDK Android instalado.'}
$taskRoot=Split-Path $PSScriptRoot -Parent
$taskPrivate=Join-Path $env:USERPROFILE '.codex/private/equilibrio/android-release'
$taskPtr=[IntPtr]::Zero
$taskProvided=[bool]($env:EQUILIBRIO_MOBILE_KEYSTORE -and $env:EQUILIBRIO_MOBILE_KEY_PASSWORD)
try{
 if(!$taskProvided){
  $taskKey=Join-Path $taskPrivate 'equilibrio-mobile.p12'
  $taskPassword=Join-Path $taskPrivate 'password.dpapi'
  if(!(Test-Path -LiteralPath $taskKey) -or !(Test-Path -LiteralPath $taskPassword)){throw 'Falta a chave de assinatura existente e recuperavel. Nao criar outra chave para atualizar a app.'}
  $taskSecure=(Get-Content -LiteralPath $taskPassword -Raw).Trim() | ConvertTo-SecureString
  $taskPtr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($taskSecure)
  $env:EQUILIBRIO_MOBILE_KEY_PASSWORD=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($taskPtr)
  $env:EQUILIBRIO_MOBILE_KEYSTORE=$taskKey
 }
 $env:EQUILIBRIO_BUILD_CHANNEL='release'
 $env:JAVA_HOME=$JavaHome;$env:ANDROID_HOME=$AndroidSdk
 if(!$env:GRADLE_USER_HOME){$env:GRADLE_USER_HOME=Join-Path $env:USERPROFILE '.cache/equilibrio/gradle-home'}
 $taskApp=Join-Path $taskRoot 'app'
 $taskProperty='sdk.dir='+$AndroidSdk.Replace('\','/').Replace(':','\:')
 $taskProperty=-join($taskProperty.ToCharArray()|ForEach-Object {if([int]$_ -gt 127){'\u{0:x4}' -f [int]$_}else{[string]$_}})
 [IO.File]::WriteAllText((Join-Path $taskApp 'android/local.properties'),$taskProperty+"`n",[Text.UTF8Encoding]::new($false))
 Push-Location $taskApp
 try{
  & npm.cmd run build;if($LASTEXITCODE -ne 0){throw 'Falha nos recursos web'}
  & ./node_modules/.bin/cap.cmd copy android;if($LASTEXITCODE -ne 0){throw 'Falha na preparacao Android'}
  $taskAssets=Join-Path $taskApp 'android/app/src/release/assets/public'
  New-Item -ItemType Directory -Force -Path $taskAssets | Out-Null
  Get-ChildItem -LiteralPath www | Copy-Item -Destination $taskAssets -Recurse -Force
  Push-Location android
  try{& ./gradlew.bat :app:assembleRelease :app:lintRelease -PequilibrioRelease=true --console=plain --max-workers=2;if($LASTEXITCODE -ne 0){throw 'Falha na compilacao ou verificacao Android'}}finally{Pop-Location}
 }finally{Pop-Location}
}finally{
 if($taskPtr -ne [IntPtr]::Zero){[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($taskPtr)}
 if(!$taskProvided){Remove-Item Env:EQUILIBRIO_MOBILE_KEY_PASSWORD,Env:EQUILIBRIO_MOBILE_KEYSTORE -ErrorAction SilentlyContinue}
 Remove-Item Env:EQUILIBRIO_BUILD_CHANNEL -ErrorAction SilentlyContinue
 $taskSecure=$null
}
