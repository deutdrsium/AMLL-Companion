$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$taskStage = $null
Push-Location -LiteralPath $taskRoot
try {
    $taskVersion = (Get-Content -LiteralPath (Join-Path $taskRoot 'package.json') -Raw | ConvertFrom-Json).version
    $taskNativeVersion = ([xml](Get-Content -LiteralPath (Join-Path $taskRoot 'native\Companion.csproj') -Raw)).Project.PropertyGroup.Version
    if ($taskVersion -notmatch '^\d+\.\d+\.\d+$' -or $taskNativeVersion -ne $taskVersion) { throw 'Package and native versions must match' }
    $taskRelease = [IO.Path]::GetFullPath((Join-Path $taskRoot 'release'))
    $taskOutput = Join-Path $taskRelease "AMLL-Companion-$taskVersion-win-x64"
    $taskStage = Join-Path $taskRelease ".pack-$taskVersion-$([guid]::NewGuid().ToString('N'))"
    foreach ($taskTarget in @($taskOutput, $taskStage)) {
        if (-not [IO.Path]::GetFullPath($taskTarget).StartsWith($taskRelease + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Publish path must stay inside release' }
    }
    $taskExistingExe = Join-Path $taskOutput 'AMLL Companion.exe'
    if (Test-Path -LiteralPath $taskExistingExe) {
        $taskCheck = [IO.File]::Open($taskExistingExe, [IO.FileMode]::Open, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
        $taskCheck.Dispose()
    }
    & "$PSScriptRoot/build-bridge.ps1"
    npm.cmd run build
    if ($LASTEXITCODE -ne 0) { throw 'Frontend build failed' }
    dotnet publish native/Companion.csproj -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true -p:EnableCompressionInSingleFile=true -p:DebugType=None -p:DebugSymbols=false -o $taskStage
    if ($LASTEXITCODE -ne 0) { throw 'Native publish failed' }
    Copy-Item -LiteralPath (Join-Path $taskRoot 'LICENSE') -Destination $taskStage
    Copy-Item -LiteralPath (Join-Path $taskRoot 'README.md') -Destination $taskStage
    Copy-Item -LiteralPath (Join-Path $taskRoot 'THIRD-PARTY-NOTICES.md') -Destination $taskStage
    Copy-Item -LiteralPath (Join-Path $taskRoot 'licenses') -Destination $taskStage -Recurse -Force
    $taskArchive = Join-Path $taskRoot "release\AMLL-Companion-$taskVersion-win-x64.zip"
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    [System.IO.Compression.ZipFile]::CreateFromDirectory($taskStage, "$taskStage.zip", [System.IO.Compression.CompressionLevel]::Fastest, $false)
    if (Test-Path -LiteralPath $taskOutput) { Remove-Item -LiteralPath $taskOutput -Recurse -Force }
    Move-Item -LiteralPath $taskStage -Destination $taskOutput
    Move-Item -LiteralPath "$taskStage.zip" -Destination $taskArchive -Force
    $taskSha = [Security.Cryptography.SHA256]::Create()
    $taskStream = [IO.File]::OpenRead($taskArchive)
    try { $taskHash = [BitConverter]::ToString($taskSha.ComputeHash($taskStream)).Replace('-', '').ToLowerInvariant() }
    finally { $taskStream.Dispose(); $taskSha.Dispose() }
    "$taskHash  $([IO.Path]::GetFileName($taskArchive))" | Set-Content -LiteralPath "$taskArchive.sha256" -Encoding ascii
} finally {
    if ($taskStage -and (Test-Path -LiteralPath $taskStage)) { Remove-Item -LiteralPath $taskStage -Recurse -Force }
    if ($taskStage -and (Test-Path -LiteralPath "$taskStage.zip")) { Remove-Item -LiteralPath "$taskStage.zip" -Force }
    Pop-Location
}
