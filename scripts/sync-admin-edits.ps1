param(
  [switch]$SkipThemeCheck
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $root

Write-Host "Syncing Shopify Admin/theme editor changes into local files..." -ForegroundColor Cyan

shopify theme pull `
  --only "templates/*.json" `
  --only "sections/*-group.json" `
  --only "config/settings_data.json" `
  --nodelete

if (-not $SkipThemeCheck) {
  Write-Host ""
  Write-Host "Running Theme Check..." -ForegroundColor Cyan
  shopify theme check
}

Write-Host ""
Write-Host "Git status after sync:" -ForegroundColor Cyan
git status --short --branch

Write-Host ""
Write-Host "Review the changed JSON/settings files. Commit them if these Admin edits are real content." -ForegroundColor Yellow
