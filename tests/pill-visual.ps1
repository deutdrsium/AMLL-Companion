$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$pillImage = [Drawing.Bitmap]::new((Join-Path $PSScriptRoot '..\test-results\pill\preview.png'))
try {
    $pillScale = $pillImage.Height / 168
    $pillCenter = [int]($pillImage.Width / 2)
    if ($pillImage.GetPixel(0, 0).A -ne 0) { throw 'The rectangular host must stay transparent' }
    if ($pillImage.GetPixel($pillCenter, [int](70 * $pillScale)).A -ne 255) { throw 'The pill body must be opaque' }
    if ($pillImage.GetPixel([int](25 * $pillScale), [int](25 * $pillScale)).A -ge 10) { throw 'Rounded corners must reveal the desktop' }
    $pillShadow = @([int](149 * $pillScale)..($pillImage.Height - 1) | ForEach-Object { $pillImage.GetPixel($pillCenter, $_).A })
    if (($pillShadow | Sort-Object -Unique).Count -le 5 -or ($pillShadow | Measure-Object -Maximum).Maximum -eq 255) { throw 'Shadow must fade gradually outside the pill' }
    Write-Output 'PASS transparent host/corners, opaque pill body and soft alpha shadow'
} finally { $pillImage.Dispose() }
