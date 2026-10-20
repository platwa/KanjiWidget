[CmdletBinding()]
param([Parameter(Mandatory)][ValidatePattern('^[0-9A-Fa-f]{40}$')][string]$CertificateThumbprint)

$ErrorActionPreference = 'Stop'
$principal = [Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'Run this cleanup as administrator to remove the temporary machine-level test certificate.'
}
$package = Get-AppxPackage -Name 'KanjiWidget.MsixCompatibilityTest'
if ($package) {
    $executable = Join-Path $package.InstallLocation 'kanji-widget.exe'
    Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -eq $executable } |
        ForEach-Object { Stop-Process -Id $_.ProcessId }
    Remove-AppxPackage -Package $package.PackageFullName
}
foreach ($store in @('Cert:\CurrentUser\TrustedPeople', 'Cert:\LocalMachine\TrustedPeople', 'Cert:\CurrentUser\My')) {
    $path = Join-Path $store $CertificateThumbprint
    if (Test-Path -LiteralPath $path) {
        $certificate = Get-Item -LiteralPath $path
        if ($certificate.Subject -ne 'CN=KanjiWidget MSIX Compatibility Test') {
            throw "Refusing to remove an unrelated certificate from $store"
        }
        Remove-Item -LiteralPath $path
    }
}
Write-Output 'Test MSIX and temporary certificates removed. Study databases and the standard installation were preserved.'
