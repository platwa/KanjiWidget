[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$ExecutablePath,
    [Parameter(Mandatory)][string]$IdentityName,
    [Parameter(Mandatory)][string]$Publisher,
    [Parameter(Mandatory)][string]$PublisherDisplayName,
    [string]$DisplayName = 'KanjiWidget',
    [string]$Version,
    [string]$MakeAppxPath,
    [string]$OutputDirectory
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
if (-not $Version) { $Version = (Get-Content (Join-Path $repo 'package.json') -Raw | ConvertFrom-Json).version + '.0' }
if ($Version -notmatch '^\d+\.\d+\.\d+\.0$') { throw 'Store versions must contain four numeric parts and end in .0.' }
if ($IdentityName -notmatch '^[A-Za-z0-9.-]{3,50}$') { throw 'Invalid MSIX package identity name.' }
if (-not $OutputDirectory) { $OutputDirectory = Join-Path $repo 'output\msix' }
$executable = (Resolve-Path -LiteralPath $ExecutablePath).Path
if (-not $MakeAppxPath) {
    $command = Get-Command makeappx.exe -ErrorAction SilentlyContinue
    if ($command) { $MakeAppxPath = $command.Source }
    elseif ($env:WINDOWS_SDK_BIN) { $MakeAppxPath = Join-Path $env:WINDOWS_SDK_BIN 'makeappx.exe' }
    else {
        $sdkRoot = (Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows Kits\Installed Roots' -ErrorAction SilentlyContinue).KitsRoot10
        if ($sdkRoot) {
            $MakeAppxPath = Get-ChildItem (Join-Path $sdkRoot 'bin\*\x64\makeappx.exe') |
                Sort-Object FullName -Descending | Select-Object -First 1 -ExpandProperty FullName
        }
    }
}
if (-not $MakeAppxPath -or -not (Test-Path -LiteralPath $MakeAppxPath)) { throw 'Provide MakeAppxPath or install Windows SDK packaging tools.' }
New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
$stage = Join-Path $OutputDirectory ('staging-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $stage, (Join-Path $stage 'Assets') -Force | Out-Null
Copy-Item -LiteralPath $executable -Destination (Join-Path $stage 'kanji-widget.exe')
foreach ($file in @('LICENSE', 'NOTICE', 'THIRD_PARTY_NOTICES.md')) {
    Copy-Item -LiteralPath (Join-Path $repo $file) -Destination $stage
}
foreach ($file in @('Square44x44Logo.png', 'Square150x150Logo.png', 'StoreLogo.png')) {
    Copy-Item -LiteralPath (Join-Path $repo "src-tauri\icons\$file") -Destination (Join-Path $stage 'Assets')
}
function XmlEscape([string]$value) { [System.Security.SecurityElement]::Escape($value) }
$identityXml = XmlEscape $IdentityName
$publisherXml = XmlEscape $Publisher
$publisherDisplayXml = XmlEscape $PublisherDisplayName
$displayXml = XmlEscape $DisplayName
$manifest = @"
<?xml version="1.0" encoding="utf-8"?>
<Package xmlns="http://schemas.microsoft.com/appx/manifest/foundation/windows10"
         xmlns:uap="http://schemas.microsoft.com/appx/manifest/uap/windows10"
         xmlns:desktop="http://schemas.microsoft.com/appx/manifest/desktop/windows10"
         xmlns:rescap="http://schemas.microsoft.com/appx/manifest/foundation/windows10/restrictedcapabilities"
         IgnorableNamespaces="uap desktop rescap">
  <Identity Name="$identityXml" Publisher="$publisherXml" Version="$Version" ProcessorArchitecture="x64" />
  <Properties>
    <DisplayName>$displayXml</DisplayName>
    <PublisherDisplayName>$publisherDisplayXml</PublisherDisplayName>
    <Logo>Assets\StoreLogo.png</Logo>
    <Description>Japanese vocabulary and kanji on your desktop</Description>
  </Properties>
  <Resources><Resource Language="en-US" /><Resource Language="ru-RU" /></Resources>
  <Dependencies>
    <TargetDeviceFamily Name="Windows.Desktop" MinVersion="10.0.19041.0" MaxVersionTested="10.0.26100.0" />
  </Dependencies>
  <Applications>
    <Application Id="KanjiWidget" Executable="kanji-widget.exe" EntryPoint="Windows.FullTrustApplication">
      <uap:VisualElements DisplayName="$displayXml" Description="Japanese vocabulary and kanji on your desktop"
          Square44x44Logo="Assets\Square44x44Logo.png" Square150x150Logo="Assets\Square150x150Logo.png" BackgroundColor="transparent" />
      <Extensions>
        <desktop:Extension Category="windows.startupTask" Executable="kanji-widget.exe" EntryPoint="Windows.FullTrustApplication">
          <desktop:StartupTask TaskId="KanjiWidgetStartup" Enabled="false" DisplayName="$displayXml" />
        </desktop:Extension>
      </Extensions>
    </Application>
  </Applications>
  <Capabilities><rescap:Capability Name="runFullTrust" /></Capabilities>
</Package>
"@
[IO.File]::WriteAllText((Join-Path $stage 'AppxManifest.xml'), $manifest, [Text.UTF8Encoding]::new($false))
$package = Join-Path $OutputDirectory "$IdentityName-$Version-x64.msix"
& $MakeAppxPath pack /d $stage /p $package /o
if ($LASTEXITCODE -ne 0) { throw "MakeAppx failed: $LASTEXITCODE" }
Get-Item -LiteralPath $package | Select-Object FullName, Length
Get-FileHash -LiteralPath $package -Algorithm SHA256
