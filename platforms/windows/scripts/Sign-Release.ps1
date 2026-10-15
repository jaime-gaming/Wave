# Run only with an already-trusted code-signing certificate in the Windows certificate store.
[CmdletBinding()]
param(
  [Parameter(Mandatory)][string]$Directory,
  [Parameter(Mandatory)][string]$CertificateThumbprint,
  [Parameter(Mandatory)][uri]$TimestampServer
)
$ErrorActionPreference = 'Stop'
if ($TimestampServer.Scheme -ne 'https') { throw 'Use an HTTPS timestamp service supplied by your certificate provider.' }
$root = (Resolve-Path $Directory).Path
$certificate = Get-Item "Cert:\CurrentUser\My\$CertificateThumbprint"
if (-not $certificate.HasPrivateKey -or $certificate.NotAfter -le (Get-Date)) { throw 'A current code-signing certificate with its private key is required.' }
if (-not ($certificate.EnhancedKeyUsageList.ObjectId.Value -contains '1.3.6.1.5.5.7.3.3')) { throw 'The certificate must permit code signing.' }
foreach ($name in @('Wave.Windows.exe', 'Wave.Windows.dll')) {
  $path = Join-Path $root $name
  if (-not (Test-Path $path)) { throw "Missing release binary: $name" }
  $signature = Set-AuthenticodeSignature -FilePath $path -Certificate $certificate -HashAlgorithm SHA256 -TimestampServer $TimestampServer.AbsoluteUri
  if ($signature.Status -ne 'Valid') { throw "Signature validation failed for $name`: $($signature.Status)" }
}
Get-ChildItem $root -File | Where-Object Name -ne 'SHA256SUMS.txt' | Sort-Object Name | ForEach-Object {
  "{0}  {1}" -f (Get-FileHash $_.FullName -Algorithm SHA256).Hash.ToLower(), $_.Name
} | Set-Content (Join-Path $root 'SHA256SUMS.txt')
Write-Host 'Wave signatures verified. Create the distribution archive only after this step.'
