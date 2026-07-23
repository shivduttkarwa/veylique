<#
.SYNOPSIS
  Git-only deploy for the Veylique Shopify theme (GitHub integration model).

.DESCRIPTION
  The live Veylique theme is connected to this repo's `master` branch via
  Shopify's GitHub integration. That makes the branch the SINGLE source of
  truth:

    * You push code to master           -> Shopify auto-deploys to the theme.
    * Merchants edit design in the admin -> Shopify auto-commits those changes
                                            back to master.

  So deploying is just git. This script does it safely in the right order:

    1. THEME CHECK (optional) to validate the code before committing.
    2. COMMIT your local code changes.
    3. PULL --rebase   -> grab any admin/theme-editor edits Shopify committed to
       master, replayed under your commit so nothing reverts.
    4. PUSH            -> Shopify picks it up and deploys.

  IMPORTANT: Never run `shopify theme push` against the connected theme. It
  fights the GitHub sync and can clobber admin edits. Use this script only.

.PARAMETER Message
  Commit message. Required unless there is nothing to commit.

.PARAMETER SkipThemeCheck
  Skip 'shopify theme check' before committing.

.EXAMPLE
  .\scripts\deploy.ps1 -Message "Add search result pages"
  .\scripts\deploy.ps1 -Message "Fix header spacing" -SkipThemeCheck
#>
param(
  [string]$Message,
  [switch]$SkipThemeCheck
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $root

Write-Host "=== Veylique deploy (git-only / GitHub integration) ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "Git status:" -ForegroundColor Cyan
git status --short --branch

# --- Step 1: validate the code ----------------------------------------------
if (-not $SkipThemeCheck) {
  Write-Host ""
  Write-Host "[1/4] Running Theme Check..." -ForegroundColor Cyan
  shopify theme check
} else {
  Write-Host ""
  Write-Host "[1/4] Skipping Theme Check (-SkipThemeCheck)." -ForegroundColor Yellow
}

# --- Step 2: commit local code changes --------------------------------------
Write-Host ""
Write-Host "[2/4] Staging and committing local changes..." -ForegroundColor Cyan
git add -A

# 'git diff --cached --quiet' exits 1 when there ARE staged changes.
git diff --cached --quiet
if ($LASTEXITCODE -ne 0) {
  if ([string]::IsNullOrWhiteSpace($Message)) {
    throw "There are changes to commit. Re-run with -Message ""your message""."
  }
  git commit -m $Message
} else {
  Write-Host "  Nothing to commit; will still sync with origin." -ForegroundColor DarkGray
}

# --- Step 3: pull admin edits Shopify committed, rebasing our work on top ----
Write-Host ""
Write-Host "[3/4] Pulling admin edits from origin/master (rebase)..." -ForegroundColor Cyan
git pull --rebase origin master
if ($LASTEXITCODE -ne 0) {
  throw "git pull --rebase hit a conflict. Resolve it, then run: git rebase --continue"
}

# --- Step 4: push -> Shopify auto-deploys -----------------------------------
Write-Host ""
Write-Host "[4/4] Pushing to origin/master (Shopify will auto-deploy)..." -ForegroundColor Cyan
git push origin master

Write-Host ""
Write-Host "Done. Shopify deploys the connected theme from master shortly." -ForegroundColor Green
git status --short --branch
