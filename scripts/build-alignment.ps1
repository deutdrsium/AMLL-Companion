$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$runtimeRoot = Join-Path $taskRoot '.tools/ctc-runtime'
$pythonRoot = Join-Path $runtimeRoot 'python'
$requirements = Join-Path $taskRoot 'alignment/requirements.txt'
New-Item -ItemType Directory -Path $pythonRoot -Force | Out-Null
$pythonExe = Join-Path $pythonRoot 'python.exe'
if (-not (Test-Path -LiteralPath $pythonExe)) {
    $archive = Join-Path $taskRoot '.tools/python-3.12.10-embed-amd64.zip'
    if (-not (Test-Path -LiteralPath $archive)) {
        Invoke-WebRequest 'https://www.python.org/ftp/python/3.12.10/python-3.12.10-embed-amd64.zip' -OutFile $archive
    }
    Expand-Archive -LiteralPath $archive -DestinationPath $pythonRoot -Force
}
[System.IO.File]::WriteAllText((Join-Path $pythonRoot 'python312._pth'), "python312.zip`n.`nLib/site-packages`nimport site`n", [System.Text.UTF8Encoding]::new($false))
$stamp = Join-Path $runtimeRoot 'requirements.sha256'
$hash = (Get-FileHash -LiteralPath $requirements -Algorithm SHA256).Hash
if (-not (Test-Path -LiteralPath $stamp) -or (Get-Content -LiteralPath $stamp -Raw).Trim() -ne $hash) {
    python -m pip install --disable-pip-version-check --upgrade --target (Join-Path $pythonRoot 'Lib/site-packages') -r $requirements
    if ($LASTEXITCODE -ne 0) { throw 'Alignment dependencies failed' }
    [System.IO.File]::WriteAllText($stamp, $hash)
}
python (Join-Path $PSScriptRoot 'download-alignment-model.py')
if ($LASTEXITCODE -ne 0) { throw 'CTC model preparation failed' }
$models = Join-Path $runtimeRoot 'models'
Copy-Item -LiteralPath (Join-Path $taskRoot 'alignment/worker.py') -Destination (Join-Path $runtimeRoot 'worker.py') -Force
Copy-Item -LiteralPath (Join-Path $taskRoot 'alignment/ctc.py') -Destination (Join-Path $runtimeRoot 'ctc.py') -Force
$verify = Join-Path $runtimeRoot 'verify.py'
[System.IO.File]::WriteAllText($verify, @'
import sys
from pathlib import Path
import onnxruntime as ort
import uroman
sys.path.insert(0, str(Path(sys.argv[1]).parent))
from ctc import forced_align
model = ort.InferenceSession(str(Path(sys.argv[1])/'model_q4.onnx'), providers=['CPUExecutionProvider'])
assert model.get_inputs()[0].name == 'input_values'
print('Portable CTC runtime ready (no torch/Whisper)')
'@, [System.Text.UTF8Encoding]::new($false))
& $pythonExe $verify $models
if ($LASTEXITCODE -ne 0) { throw 'Portable alignment model failed to load' }
& $pythonExe (Join-Path $PSScriptRoot 'alignment-inventory.py')
if ($LASTEXITCODE -ne 0) { throw 'Alignment dependency inventory failed' }
