param(
  [int]$Port = 9292
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $root

Write-Host "Starting Shopify dev server with theme editor sync..." -ForegroundColor Cyan
Write-Host "Use Ctrl+C to stop it." -ForegroundColor Yellow

shopify theme dev --allow-live --theme-editor-sync --port $Port
