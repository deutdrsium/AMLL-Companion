$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
if (Test-Path "$taskRoot/.tools/cargo/bin/cargo.exe") {
    $env:RUSTUP_HOME = "$taskRoot/.tools/rustup"
    $env:CARGO_HOME = "$taskRoot/.tools/cargo"
    $env:PATH = "$taskRoot/.tools/cargo/bin;$env:PATH"
}
Push-Location -LiteralPath $taskRoot
try {
    cargo build --release --manifest-path native/unilyric-bridge/Cargo.toml --locked
    if ($LASTEXITCODE -ne 0) { throw 'UniLyric engine build failed' }
} finally { Pop-Location }
