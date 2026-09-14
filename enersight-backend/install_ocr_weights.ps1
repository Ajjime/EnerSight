<#
Copies the three trained OCR checkpoints into app/ocr_models/weights/, renaming
them from the flat "<ExpName>_best_accuracy.pth" form the Colab notebook writes
to Google Drive into the per-folder layout the backend expects.

Usage (from enersight-backend/):
    .\install_ocr_weights.ps1                       # looks in your Downloads folder
    .\install_ocr_weights.ps1 -Source "D:\somewhere"
#>
param(
    [string]$Source = (Join-Path $env:USERPROFILE "Downloads")
)

$ErrorActionPreference = "Stop"

$targetRoot = Join-Path $PSScriptRoot "app\ocr_models\weights"

$files = @{
    "None-VGG-BiLSTM-CTC_best_accuracy.pth"    = "None-VGG-BiLSTM-CTC"
    "TPS-ResNet-BiLSTM-Attn_best_accuracy.pth" = "TPS-ResNet-BiLSTM-Attn"
    "TPS-ResNet-BiLSTM-CTC_best_accuracy.pth"  = "TPS-ResNet-BiLSTM-CTC"
}

Write-Host "Looking for checkpoints in: $Source`n"

$found = 0
foreach ($name in $files.Keys) {
    $src = Join-Path $Source $name

    # Also accept the file already renamed to best_accuracy.pth inside a matching folder.
    if (-not (Test-Path $src)) {
        $alt = Join-Path $Source (Join-Path $files[$name] "best_accuracy.pth")
        if (Test-Path $alt) { $src = $alt }
    }

    if (-not (Test-Path $src)) {
        Write-Host "  MISSING  $name" -ForegroundColor Yellow
        continue
    }

    $destDir = Join-Path $targetRoot $files[$name]
    if (-not (Test-Path $destDir)) {
        New-Item -ItemType Directory -Path $destDir -Force | Out-Null
    }
    $dest = Join-Path $destDir "best_accuracy.pth"

    Copy-Item -Path $src -Destination $dest -Force
    $mb = [math]::Round((Get-Item $dest).Length / 1MB, 1)
    Write-Host "  OK       $($files[$name])\best_accuracy.pth  ($mb MB)" -ForegroundColor Green
    $found++
}

Write-Host "`n$found of $($files.Count) checkpoints installed."
if ($found -lt $files.Count) {
    Write-Host "Download the missing ones from Google Drive (KWH_OCR_Capstone) into $Source, then re-run." -ForegroundColor Yellow
} else {
    Write-Host "Start the backend and check GET /ocr/health -> dtrb_variants_loaded." -ForegroundColor Cyan
}
