# Original geometric QNT mark and social card. No external images or fonts.
# Run from frontend: powershell -NoProfile -ExecutionPolicy Bypass -File scripts/create-brand-assets.ps1
param([string]$AssetDirectory = (Join-Path $PSScriptRoot '../public'))
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$targetDirectory = [IO.Path]::GetFullPath($AssetDirectory)
New-Item -ItemType Directory -Force $targetDirectory | Out-Null
function Color($hex) { [Drawing.ColorTranslator]::FromHtml($hex) }
function Brush($hex) { [Drawing.SolidBrush]::new((Color $hex)) }
function Draw-Mark($g, [single]$x, [single]$y, [single]$size) {
    $state = $g.Save()
    $g.TranslateTransform($x, $y)
    $g.ScaleTransform(($size / 64), ($size / 64))
    $bg = Brush '#174c3f'
    $g.FillRectangle($bg, 0, 0, 64, 64)
    $ring = [Drawing.Pen]::new((Color '#f6f7f2'), 8)
    $tail = [Drawing.Pen]::new((Color '#c5e78b'), 8)
    $tail.StartCap = [Drawing.Drawing2D.LineCap]::Square
    $tail.EndCap = [Drawing.Drawing2D.LineCap]::Square
    $g.DrawEllipse($ring, 14, 14, 32, 32)
    $g.DrawLine($tail, 40, 40, 50, 50)
    $bg.Dispose(); $ring.Dispose(); $tail.Dispose()
    $g.Restore($state)
}
function Graphics($bitmap) {
    $g = [Drawing.Graphics]::FromImage($bitmap)
    $g.SmoothingMode = [Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.TextRenderingHint = [Drawing.Text.TextRenderingHint]::AntiAliasGridFit
    return $g
}
function Draw-Text($g, $text, [single]$size, [single]$x, [single]$y, $hex, $bold = $false) {
    $weight = if ($bold) { [Drawing.FontStyle]::Bold } else { [Drawing.FontStyle]::Regular }
    $font = [Drawing.Font]::new('Segoe UI', $size, $weight, [Drawing.GraphicsUnit]::Pixel)
    $brush = Brush $hex
    $g.DrawString($text, $font, $brush, $x, $y)
    $font.Dispose(); $brush.Dispose()
}
$apple = [Drawing.Bitmap]::new(180, 180)
$g = Graphics $apple
Draw-Mark $g 0 0 180
$apple.Save((Join-Path $targetDirectory 'apple-touch-icon.png'), [Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $apple.Dispose()

# Multi-resolution ICO with PNG entries (16, 32 and 48 px).
$images = @()
foreach ($size in @(16, 32, 48)) {
    $bitmap = [Drawing.Bitmap]::new($size, $size)
    $g = Graphics $bitmap
    Draw-Mark $g 0 0 $size
    $stream = [IO.MemoryStream]::new()
    $bitmap.Save($stream, [Drawing.Imaging.ImageFormat]::Png)
    $images += @{ Size = $size; Bytes = $stream.ToArray() }
    $stream.Dispose(); $g.Dispose(); $bitmap.Dispose()
}
$icoStream = [IO.File]::Create((Join-Path $targetDirectory 'favicon.ico'))
$writer = [IO.BinaryWriter]::new($icoStream)
$writer.Write([uint16]0); $writer.Write([uint16]1); $writer.Write([uint16]3)
$offset = 6 + 16 * 3
foreach ($image in $images) {
    $writer.Write([byte]$image.Size); $writer.Write([byte]$image.Size)
    $writer.Write([byte]0); $writer.Write([byte]0)
    $writer.Write([uint16]1); $writer.Write([uint16]32)
    $writer.Write([uint32]$image.Bytes.Length); $writer.Write([uint32]$offset)
    $offset += $image.Bytes.Length
}
foreach ($image in $images) { $writer.Write([byte[]]$image.Bytes) }
$writer.Dispose(); $icoStream.Dispose()

$og = [Drawing.Bitmap]::new(1200, 630)
$g = Graphics $og
$g.Clear((Color '#f6f7f2'))
Draw-Mark $g 76 68 64
Draw-Text $g 'КОМАНДА QNT' 22 160 68 '#174c3f' $true
Draw-Text $g 'FIREBIRD / КЕЙС №6' 16 160 102 '#52685e'
Draw-Text $g 'QNT Match' 88 69 197 '#174c3f' $true
Draw-Text $g 'Ваше событие.' 38 76 332 '#193c34'
Draw-Text $g 'Подходящие люди.' 38 76 383 '#526d50'
Draw-Text $g 'До 3 подрядчиков. Понятные основания выбора.' 23 78 533 '#52685e'
$line = [Drawing.Pen]::new((Color '#cfdbc7'), 2)
$white = Brush '#ffffff'
$green = Brush '#174c3f'
$lime = Brush '#c5e78b'
for ($i = 0; $i -lt 3; $i++) {
    $x = 883 + $i * 10; $y = 188 + $i * 106
    $g.FillRectangle($white, $x, $y, 204, 86)
    $g.DrawRectangle($line, $x, $y, 204, 86)
    $g.FillEllipse($lime, ($x + 18), ($y + 19), 25, 25)
    $g.FillRectangle($green, ($x + 58), ($y + 24), 117, 7)
    $g.DrawLine($line, ($x + 58), ($y + 42), ($x + 146), ($y + 42))
    $g.DrawLine($line, ($x + 20), ($y + 63), ($x + 175), ($y + 63))
}
$og.Save((Join-Path $targetDirectory 'og-qnt.png'), [Drawing.Imaging.ImageFormat]::Png)
$line.Dispose(); $white.Dispose(); $green.Dispose(); $lime.Dispose(); $g.Dispose(); $og.Dispose()
Get-ChildItem $targetDirectory | Select-Object Name, Length
