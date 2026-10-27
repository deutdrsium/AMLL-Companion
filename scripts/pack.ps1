$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
Push-Location -LiteralPath $taskRoot
try {
    & "$PSScriptRoot/build-bridge.ps1"
    npm.cmd run build
    if ($LASTEXITCODE -ne 0) { throw 'Frontend build failed' }
    $taskOutput = Join-Path $taskRoot 'release\AMLL-Companion-0.5.2-win-x64'
    dotnet publish native/Companion.csproj -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true -p:EnableCompressionInSingleFile=true -p:DebugType=None -p:DebugSymbols=false -o $taskOutput
    if ($LASTEXITCODE -ne 0) { throw 'Native publish failed' }
    Copy-Item -LiteralPath (Join-Path $taskRoot 'LICENSE') -Destination $taskOutput
    Copy-Item -LiteralPath (Join-Path $taskRoot 'README.md') -Destination $taskOutput
    Copy-Item -LiteralPath (Join-Path $taskRoot 'THIRD-PARTY-NOTICES.md') -Destination $taskOutput
    Copy-Item -LiteralPath (Join-Path $taskRoot 'licenses') -Destination $taskOutput -Recurse -Force
    Compress-Archive -Path (Join-Path $taskOutput '*') -DestinationPath (Join-Path $taskRoot 'release\AMLL-Companion-0.5.2-win-x64.zip') -Force
} finally { Pop-Location }
