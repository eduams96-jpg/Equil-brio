$ErrorActionPreference='Stop'
$taskRequest=([Console]::In.ReadToEnd() | ConvertFrom-Json)
$taskAddress=[Net.IPAddress]::Parse([string]$taskRequest.host)
$taskRootKey=[Security.Cryptography.RSA]::Create(3072)
$taskLeafKey=[Security.Cryptography.RSA]::Create(3072)
$taskHash=[Security.Cryptography.HashAlgorithmName]::SHA256
$taskPadding=[Security.Cryptography.RSASignaturePadding]::Pkcs1
$taskRootRequest=[Security.Cryptography.X509Certificates.CertificateRequest]::new('CN=Equilibrio Local CA',$taskRootKey,$taskHash,$taskPadding)
$taskRootRequest.CertificateExtensions.Add([Security.Cryptography.X509Certificates.X509BasicConstraintsExtension]::new($true,$false,0,$true))
$taskRootRequest.CertificateExtensions.Add([Security.Cryptography.X509Certificates.X509KeyUsageExtension]::new([Security.Cryptography.X509Certificates.X509KeyUsageFlags]::KeyCertSign -bor [Security.Cryptography.X509Certificates.X509KeyUsageFlags]::CrlSign,$true))
$taskNow=[DateTimeOffset]::UtcNow
$taskRoot=$taskRootRequest.CreateSelfSigned($taskNow.AddMinutes(-5),$taskNow.AddYears(5))
$taskLeafRequest=[Security.Cryptography.X509Certificates.CertificateRequest]::new(('CN='+$taskAddress),$taskLeafKey,$taskHash,$taskPadding)
$taskSan=[Security.Cryptography.X509Certificates.SubjectAlternativeNameBuilder]::new()
$taskSan.AddIpAddress($taskAddress)
$taskLeafRequest.CertificateExtensions.Add($taskSan.Build())
$taskLeafRequest.CertificateExtensions.Add([Security.Cryptography.X509Certificates.X509BasicConstraintsExtension]::new($false,$false,0,$true))
$taskLeafRequest.CertificateExtensions.Add([Security.Cryptography.X509Certificates.X509KeyUsageExtension]::new([Security.Cryptography.X509Certificates.X509KeyUsageFlags]::DigitalSignature -bor [Security.Cryptography.X509Certificates.X509KeyUsageFlags]::KeyEncipherment,$true))
$taskOids=[Security.Cryptography.OidCollection]::new();[void]$taskOids.Add([Security.Cryptography.Oid]::new('1.3.6.1.5.5.7.3.1'))
$taskLeafRequest.CertificateExtensions.Add([Security.Cryptography.X509Certificates.X509EnhancedKeyUsageExtension]::new($taskOids,$true))
$taskSerial=[byte[]]::new(16);$taskRng=[Security.Cryptography.RandomNumberGenerator]::Create();$taskRng.GetBytes($taskSerial)
$taskLeafPublic=$taskLeafRequest.Create($taskRoot,$taskNow.AddMinutes(-3),$taskNow.AddDays(365),$taskSerial)
$taskLeaf=[Security.Cryptography.X509Certificates.RSACertificateExtensions]::CopyWithPrivateKey($taskLeafPublic,$taskLeafKey)
$taskCollection=[Security.Cryptography.X509Certificates.X509Certificate2Collection]::new();[void]$taskCollection.Add($taskLeaf);[void]$taskCollection.Add([Security.Cryptography.X509Certificates.X509Certificate2]::new($taskRoot.Export([Security.Cryptography.X509Certificates.X509ContentType]::Cert)))
$taskPfx=$taskCollection.Export([Security.Cryptography.X509Certificates.X509ContentType]::Pfx,[string]$taskRequest.passphrase)
$taskCertificate=[Convert]::ToBase64String($taskLeaf.Export([Security.Cryptography.X509Certificates.X509ContentType]::Cert),[Base64FormattingOptions]::InsertLineBreaks)
$taskCa=[Convert]::ToBase64String($taskRoot.Export([Security.Cryptography.X509Certificates.X509ContentType]::Cert),[Base64FormattingOptions]::InsertLineBreaks)
@{cert="-----BEGIN CERTIFICATE-----`n$taskCertificate`n-----END CERTIFICATE-----";caCert="-----BEGIN CERTIFICATE-----`n$taskCa`n-----END CERTIFICATE-----";pfx=[Convert]::ToBase64String($taskPfx)} | ConvertTo-Json -Compress
$taskLeaf.Dispose();$taskLeafPublic.Dispose();$taskRoot.Dispose();$taskRootKey.Dispose();$taskLeafKey.Dispose();$taskRng.Dispose()
