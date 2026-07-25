<#
.SYNOPSIS
  Reprice the Veylique demo products to realistic INR values (all >= Rs. 3,000).

.DESCRIPTION
  The store's currency is INR, but seed-demo-data.ps1 used USD-shaped numbers
  (68.00, 89.00, ...), so a dress read as Rs. 68. This sets a sensible INR price
  on EVERY variant of each demo product.

  Prices are deliberately spread across Rs. 3,000 - Rs. 5,499 rather than set to
  a single value, so the storefront price filter has a meaningful range to work
  with instead of one degenerate bucket.

  Idempotent: re-running simply reasserts the same prices.

.PARAMETER Store
  myshopify domain. Defaults to veylique-development.myshopify.com.

.PARAMETER DiscountPercent
  When > 0, also sets a compare-at price this many percent above the price, which
  lights up the theme's sale badge and strike-through. Default 0 (no sale).

.EXAMPLE
  .\scripts\set-product-prices.ps1
  .\scripts\set-product-prices.ps1 -DiscountPercent 25
#>
param(
  [string]$Store = "veylique-development.myshopify.com",
  [int]$DiscountPercent = 0
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$tmp = Join-Path $env:TEMP "veylique-prices"
New-Item -ItemType Directory -Force -Path $tmp | Out-Null

function Invoke-Gql {
  param([string]$Query, $Variables)
  $qf = Join-Path $tmp "query.graphql"
  $vf = Join-Path $tmp "vars.json"
  $rf = Join-Path $tmp "result.json"
  Set-Content -Path $qf -Value $Query -Encoding UTF8
  if ($null -eq $Variables) { $Variables = @{} }
  ($Variables | ConvertTo-Json -Depth 40) | Set-Content -Path $vf -Encoding UTF8

  shopify store execute --store $Store --query-file $qf --variable-file $vf `
    --allow-mutations --json --output-file $rf 2>$null | Out-Null

  if (-not (Test-Path $rf)) { throw "No result from store execute (is auth set up?)." }
  $res = Get-Content $rf -Raw | ConvertFrom-Json
  Remove-Item $rf -Force -ErrorAction SilentlyContinue
  if ($res.PSObject.Properties.Name -contains "errors" -and $res.errors) {
    throw "GraphQL error: $($res.errors | ConvertTo-Json -Depth 10)"
  }
  return $res
}

function Assert-NoUserErrors($payload, [string]$label) {
  if ($null -ne $payload -and $payload.PSObject.Properties.Name -contains "userErrors" -and $payload.userErrors) {
    Write-Host "  FAILED $label : $($payload.userErrors | ConvertTo-Json -Depth 10 -Compress)" -ForegroundColor Red
    return $false
  }
  return $true
}

# --- INR price per product (all >= 3000) ------------------------------------
$priceMap = [ordered]@{
  "mustard-wrap-midi-dress"   = 3499
  "tiered-cotton-maxi-dress"  = 3999
  "satin-slip-dress"          = 3299
  "embroidered-kurta-set"     = 4499
  "anarkali-flare-kurta"      = 4999
  "block-print-cotton-kurti"  = 3199
  "oversized-denim-jacket"    = 5499
  "straight-leg-jeans"        = 3799
  "ribbed-knit-sweater"       = 3299
  "linen-shirt-shorts-co-ord" = 4299
  "satin-cami-trouser-set"    = 4799
  "knit-lounge-co-ord"        = 3899
  "poplin-oversized-shirt"    = 3099
  "puff-sleeve-blouse"        = 3199
  "ribbed-tank-top"           = 3000
}

$productQuery = @'
query($q: String!) {
  products(first: 1, query: $q) {
    nodes { id title variants(first: 100) { nodes { id } } }
  }
}
'@

$updateMutation = @'
mutation($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
  productVariantsBulkUpdate(productId: $productId, variants: $variants) {
    product { id }
    userErrors { field message }
  }
}
'@

Write-Host "=== Veylique demo pricing (INR) ===" -ForegroundColor Cyan
if ($DiscountPercent -gt 0) {
  Write-Host "Compare-at prices set $DiscountPercent% above price (sale badges on)." -ForegroundColor Yellow
}
Write-Host ""

$changed = 0
$skipped = 0
$failed = 0

foreach ($handle in $priceMap.Keys) {
  $price = $priceMap[$handle]

  $found = Invoke-Gql $productQuery @{ q = "handle:$handle" }
  if ($found.products.nodes.Count -eq 0) {
    Write-Host "  missing:  $handle" -ForegroundColor Yellow
    $skipped++
    continue
  }

  $product = $found.products.nodes[0]
  $variants = @()
  foreach ($variant in $product.variants.nodes) {
    $entry = @{ id = $variant.id; price = "$price" }
    if ($DiscountPercent -gt 0) {
      $compareAt = [math]::Round($price / (1 - ($DiscountPercent / 100.0)))
      $entry.compareAtPrice = "$compareAt"
    }
    $variants += $entry
  }

  $res = Invoke-Gql $updateMutation @{ productId = $product.id; variants = $variants }
  if (Assert-NoUserErrors $res.productVariantsBulkUpdate "reprice $($product.title)") {
    Write-Host ("  updated:  {0,-32} Rs. {1}  ({2} variants)" -f $product.title, $price, $variants.Count) -ForegroundColor Green
    $changed++
  } else {
    $failed++
  }
}

Write-Host ""
Write-Host "Done. changed=$changed skipped=$skipped failed=$failed" -ForegroundColor Cyan
