param([string]$Source,[string]$Target)
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
if (Test-Path $Target) { Remove-Item $Target -Force }
$zip = [System.IO.Compression.ZipFile]::Open($Target, [System.IO.Compression.ZipArchiveMode]::Create)
try {
  $base = (Resolve-Path $Source).Path.TrimEnd('\') + '\'
  Get-ChildItem -LiteralPath $Source -Recurse -File | ForEach-Object {
    $name = $_.FullName.Substring($base.Length).Replace('\','/')
    [void][System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $_.FullName, $name, [System.IO.Compression.CompressionLevel]::Optimal)
  }
} finally { $zip.Dispose() }
