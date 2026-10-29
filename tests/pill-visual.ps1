$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$pillImage = [Drawing.Bitmap]::new((Join-Path $PSScriptRoot '..\test-results\pill\preview.png'))
try {
    $pillScale = $pillImage.Height / 168
    $pillCenter = [int]($pillImage.Width / 2)
    if ($pillImage.GetPixel(0, 0).A -ne 0) { throw 'The rectangular host must stay transparent' }
    if ($pillImage.GetPixel($pillCenter, [int](70 * $pillScale)).A -ne 255) { throw 'The pill body must be opaque' }
    if ($pillImage.GetPixel([int](22 * $pillScale), [int](22 * $pillScale)).A -ge 10) { throw 'Rounded corners must reveal the desktop' }
    $pillShadow = @([int](149 * $pillScale)..($pillImage.Height - 1) | ForEach-Object { $pillImage.GetPixel($pillCenter, $_).A })
    if (($pillShadow | Sort-Object -Unique).Count -le 5 -or ($pillShadow | Measure-Object -Maximum).Maximum -eq 255) { throw 'Shadow must fade gradually outside the pill' }
    Write-Output 'PASS transparent host/corners, opaque pill body and soft alpha shadow'
} finally { $pillImage.Dispose() }
$pillTransparent = [Drawing.Bitmap]::new((Join-Path $PSScriptRoot '..\test-results\pill\transparent.png'))
try {
    $pillEmpty = 0
    $pillSamples = 0
    for ($pillY = 0; $pillY -lt $pillTransparent.Height; $pillY += 4) {
        for ($pillX = 0; $pillX -lt $pillTransparent.Width; $pillX += 4) {
            $pillSamples++
            if ($pillTransparent.GetPixel($pillX, $pillY).A -eq 0) { $pillEmpty++ }
        }
    }
    if ($pillEmpty -lt $pillSamples * 0.8 -or $pillEmpty -eq $pillSamples) { throw 'Transparent mode must render visible glyphs over an otherwise transparent window' }
    if ($pillTransparent.GetPixel(75, [int]($pillTransparent.Height / 2)).A -ne 0) { throw 'No pill body or shadow may remain behind the text' }
    Write-Output 'PASS transparent text: visible glyphs, empty body and no pill shadow'
} finally { $pillTransparent.Dispose() }
$glassBent = [Drawing.Bitmap]::new((Join-Path $PSScriptRoot '..\test-results\glass\refraction.png'))
$glassFlat = [Drawing.Bitmap]::new((Join-Path $PSScriptRoot '..\test-results\glass\refraction-flat.png'))
try {
    $glassChanged = 0
    for ($glassY = 30; $glassY -lt ($glassBent.Height - 30); $glassY += 3) {
        for ($glassX = 30; $glassX -lt ($glassBent.Width - 30); $glassX += 3) {
            $glassA = $glassBent.GetPixel($glassX, $glassY)
            $glassB = $glassFlat.GetPixel($glassX, $glassY)
            if ([Math]::Abs([int]$glassA.R - [int]$glassB.R) + [Math]::Abs([int]$glassA.G - [int]$glassB.G) -gt 20) { $glassChanged++ }
        }
    }
    if ($glassChanged -lt 100) { throw 'SVG displacement must actually refract the live backdrop, beyond CSS frosting and highlights' }
    Write-Output "PASS live backdrop refraction: $glassChanged changed pixel samples compared with refraction disabled"
} finally { $glassBent.Dispose(); $glassFlat.Dispose() }
