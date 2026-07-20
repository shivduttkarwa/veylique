param(
  [switch]$SkipThemeCheck,
  [switch]$Commit,
  [string]$Message
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $root

Write-Host "Preparing local code for Shopify..." -ForegroundColor Cyan
Write-Host ""
Write-Host "Current git status:" -ForegroundColor Cyan
git status --short --branch

if (-not $SkipThemeCheck) {
  Write-Host ""
  Write-Host "Running Theme Check..." -ForegroundColor Cyan
  shopify theme check
}

Write-Host ""
Write-Host "Pushing local theme code to the pinned Shopify theme..." -ForegroundColor Cyan
shopify theme push --strict --allow-live

if ($Commit) {
  if ([string]::IsNullOrWhiteSpace($Message)) {
    throw "Pass a commit message with -Message when using -Commit."
  }

  Write-Host ""
  Write-Host "Committing and pushing to origin/master..." -ForegroundColor Cyan
  git add -A
  git commit -m $Message
  git push origin master
}

Write-Host ""
Write-Host "Final git status:" -ForegroundColor Cyan
git status --short --branch
