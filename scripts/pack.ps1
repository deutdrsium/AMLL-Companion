$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
Push-Location -LiteralPath $taskRoot
try {
    & "$PSScriptRoot/build-bridge.ps1"
    & "$PSScriptRoot/build-alignment.ps1"
    python "$PSScriptRoot/prepare-alignment-sources.py"
    if ($LASTEXITCODE -ne 0) { throw 'Alignment source preparation failed' }
    npm.cmd run build
    if ($LASTEXITCODE -ne 0) { throw 'Frontend build failed' }
    $taskVersion = (Get-Content -LiteralPath (Join-Path $taskRoot 'package.json') -Raw | ConvertFrom-Json).version
    $taskOutput = Join-Path $taskRoot "release\AMLL-Companion-$taskVersion-win-x64"
    dotnet publish native/Companion.csproj -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true -p:EnableCompressionInSingleFile=true -p:DebugType=None -p:DebugSymbols=false -o $taskOutput
    if ($LASTEXITCODE -ne 0) { throw 'Native publish failed' }
    Copy-Item -LiteralPath (Join-Path $taskRoot 'LICENSE') -Destination $taskOutput
    Copy-Item -LiteralPath (Join-Path $taskRoot 'README.md') -Destination $taskOutput
    Copy-Item -LiteralPath (Join-Path $taskRoot 'THIRD-PARTY-NOTICES.md') -Destination $taskOutput
    Copy-Item -LiteralPath (Join-Path $taskRoot 'licenses') -Destination $taskOutput -Recurse -Force
    $taskAlignment = Join-Path $taskOutput 'alignment'
    New-Item -ItemType Directory -Path (Join-Path $taskAlignment 'models') -Force | Out-Null
    Copy-Item -LiteralPath (Join-Path $taskRoot '.tools/alignment-runtime/python') -Destination $taskAlignment -Recurse -Force
    Copy-Item -LiteralPath (Join-Path $taskRoot 'alignment/worker.py') -Destination $taskAlignment -Force
    Copy-Item -LiteralPath (Join-Path $taskRoot 'alignment/README.md') -Destination $taskAlignment -Force
    Copy-Item -LiteralPath (Join-Path $taskRoot '.tools/alignment-runtime/DEPENDENCIES.json') -Destination $taskAlignment -Force
    Copy-Item -LiteralPath (Join-Path $taskRoot '.tools/alignment-runtime/models/small.pt') -Destination (Join-Path $taskAlignment 'models') -Force
    $taskSources = Join-Path $taskAlignment 'sources'
    New-Item -ItemType Directory -Path $taskSources -Force | Out-Null
    Copy-Item -Path (Join-Path $taskRoot '.tools/alignment-sources/*') -Destination $taskSources -Exclude '*.part' -Recurse -Force
    $taskArchive = Join-Path $taskRoot "release\AMLL-Companion-$taskVersion-win-x64.zip"
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    if (Test-Path -LiteralPath $taskArchive) { Remove-Item -LiteralPath $taskArchive }
    [System.IO.Compression.ZipFile]::CreateFromDirectory($taskOutput, $taskArchive, [System.IO.Compression.CompressionLevel]::Fastest, $false)
} finally { Pop-Location }
