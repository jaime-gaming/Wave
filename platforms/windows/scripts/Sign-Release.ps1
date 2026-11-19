# Sign the standalone Wave.exe release binary with an Authenticode code-signing certificate.
[CmdletBinding()]
param(
  [Parameter(Mandatory)][string]$ExecutablePath,
  [Parameter(Mandatory)][string]$CertificateThumbprint,
  [Parameter(Mandatory)][uri]$TimestampServer
)
$ErrorActionPreference = 'Stop'
if ($TimestampServer.Scheme -ne 'https') { throw 'Use an HTTPS timestamp service supplied by your certificate provider.' }
$binary = (Resolve-Path $ExecutablePath).Path
$certificate = Get-Item "Cert:\CurrentUser\My\$CertificateThumbprint"
if (-not $certificate.HasPrivateKey -or $certificate.NotAfter -le (Get-Date)) { throw 'A current code-signing certificate with its private key is required.' }
$usages = @($certificate.Extensions | Where-Object { $_ -is [System.Security.Cryptography.X509Certificates.X509EnhancedKeyUsageExtension] } | ForEach-Object { $_.EnhancedKeyUsages } | ForEach-Object { $_.Value })
if (-not ($usages -contains '1.3.6.1.5.5.7.3.3')) { throw 'The certificate must permit code signing.' }
$signature = Set-AuthenticodeSignature -FilePath $binary -Certificate $certificate -HashAlgorithm SHA256 -TimestampServer $TimestampServer.AbsoluteUri
if ($signature.Status -ne 'Valid') { throw "Signature validation failed for $(Split-Path -Leaf $binary): $($signature.Status)" }
Write-Host "Wave single-file executable signed and verified: $binary"
