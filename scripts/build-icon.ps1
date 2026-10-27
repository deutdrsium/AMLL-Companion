$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$taskRoot = Split-Path -Parent $PSScriptRoot
$taskAssets = Join-Path $taskRoot 'native/Assets'
[IO.Directory]::CreateDirectory($taskAssets) | Out-Null
$sizes = @(16, 24, 32, 48, 64, 128, 256)
$images = @()
foreach ($size in $sizes) {
    $bitmap = [Drawing.Bitmap]::new($size, $size)
    $graphics = [Drawing.Graphics]::FromImage($bitmap)
    $graphics.SmoothingMode = [Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.ScaleTransform(($size / 32.0), ($size / 32.0))
    $background = [Drawing.Drawing2D.GraphicsPath]::new()
    $background.AddArc(0, 0, 16, 16, 180, 90)
    $background.AddArc(16, 0, 16, 16, 270, 90)
    $background.AddArc(16, 16, 16, 16, 0, 90)
    $background.AddArc(0, 16, 16, 16, 90, 90)
    $background.CloseFigure()
    $brush = [Drawing.SolidBrush]::new([Drawing.ColorTranslator]::FromHtml('#8f6576'))
    $graphics.FillPath($brush, $background)
    # Same filled Lucide Music2 geometry as public/app-icon.svg and the title bar.
    $graphics.TranslateTransform(4, 4)
    $pen = [Drawing.Pen]::new([Drawing.Color]::White, 2)
    $pen.StartCap = $pen.EndCap = [Drawing.Drawing2D.LineCap]::Round
    $pen.LineJoin = [Drawing.Drawing2D.LineJoin]::Round
    $graphics.FillEllipse([Drawing.Brushes]::White, 4, 14, 8, 8)
    $graphics.DrawEllipse($pen, 4, 14, 8, 8)
    $points = [Drawing.PointF[]]@([Drawing.PointF]::new(12,18), [Drawing.PointF]::new(12,2), [Drawing.PointF]::new(19,6))
    $graphics.FillPolygon([Drawing.Brushes]::White, $points)
    $graphics.DrawLines($pen, $points)
    $stream = [IO.MemoryStream]::new()
    $bitmap.Save($stream, [Drawing.Imaging.ImageFormat]::Png)
    $images += ,$stream.ToArray()
    $stream.Dispose(); $pen.Dispose(); $brush.Dispose(); $background.Dispose(); $graphics.Dispose(); $bitmap.Dispose()
}
$output = [IO.File]::Create((Join-Path $taskAssets 'app.ico'))
$writer = [IO.BinaryWriter]::new($output)
try {
    $writer.Write([uint16]0); $writer.Write([uint16]1); $writer.Write([uint16]$sizes.Count)
    $offset = 6 + 16 * $sizes.Count
    for ($i = 0; $i -lt $sizes.Count; $i++) {
        $dimension = if ($sizes[$i] -eq 256) { 0 } else { $sizes[$i] }
        $writer.Write([byte]$dimension); $writer.Write([byte]$dimension)
        $writer.Write([byte]0); $writer.Write([byte]0)
        $writer.Write([uint16]1); $writer.Write([uint16]32)
        $writer.Write([uint32]$images[$i].Length); $writer.Write([uint32]$offset)
        $offset += $images[$i].Length
    }
    foreach ($bytes in $images) { $writer.Write([byte[]]$bytes) }
} finally { $writer.Dispose() }
Write-Output 'Generated native/Assets/app.ico (16-256px).'
