<#
.SYNOPSIS
  Add a Color option (with size x color variants) to the Veylique demo products
  so the storefront colour filter and the theme's swatch UI have data.

.DESCRIPTION
  The seeded demo products only had a "Size" option, so:
    * Search & Discovery had no colour to build a filter from, and
    * the theme's swatch dots (product card, PDP, filter sidebar) had nothing
      to render.

  This script gives each demo product a second option, "Color", and rebuilds its
  variant matrix as Size x Color at the product's existing price.

  COLOUR NAMING — deliberate: every colour is a single-word CSS named colour
  (Goldenrod, Olive, Ivory, ...). The theme falls back to
  `background: {{ value | handleize }}` when Shopify has no native swatch, so
  CSS-valid names make the dots render the right colour without any metaobject
  plumbing. Two-word names ("Slate Gray" -> "slate-gray") would NOT resolve, so
  keep new colours single-word.

  Native Shopify swatches (option values linked to shopify--color-pattern
  metaobjects) are a separate, better mechanism, but the CLI's stored store auth
  lacks the metaobject scopes. To go that route, re-auth with:

    shopify store auth --store veylique-development.myshopify.com `
      --scopes write_products,read_products,write_publications,read_publications,read_metaobjects,write_metaobjects,read_metaobject_definitions,write_metaobject_definitions

  Idempotent: a product that already has a Color option is skipped.

.PARAMETER Store
  myshopify domain. Defaults to veylique-development.myshopify.com.

.PARAMETER Remove
  Strip the Color option back off, returning each product to Size-only variants.

.EXAMPLE
  .\scripts\add-product-colors.ps1
  .\scripts\add-product-colors.ps1 -Remove
#>
param(
  [string]$Store = "veylique-development.myshopify.com",
  [switch]$Remove
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$tmp = Join-Path $env:TEMP "veylique-colors"
New-Item -ItemType Directory -Force -Path $tmp | Out-Null

# --- Run a GraphQL query/mutation via the CLI (uses stored store auth) -------
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

# --- Colour palette per product ---------------------------------------------
# Single-word CSS named colours only (see NOTE in .DESCRIPTION).
$colorMap = [ordered]@{
  "mustard-wrap-midi-dress"   = @("Goldenrod", "Olive", "Ivory")
  "tiered-cotton-maxi-dress"  = @("Ivory", "Tan", "Teal")
  "satin-slip-dress"          = @("Plum", "Black", "Ivory")
  "embroidered-kurta-set"     = @("Maroon", "Navy", "Goldenrod")
  "anarkali-flare-kurta"      = @("Maroon", "Teal", "Ivory")
  "block-print-cotton-kurti"  = @("Navy", "Beige", "Olive")
  "oversized-denim-jacket"    = @("Navy", "Black", "Khaki")
  "straight-leg-jeans"        = @("Navy", "Black", "Beige")
  "ribbed-knit-sweater"       = @("Beige", "Olive", "Maroon")
  "linen-shirt-shorts-co-ord" = @("Beige", "Olive", "Ivory")
  "satin-cami-trouser-set"    = @("Plum", "Black", "Tan")
  "knit-lounge-co-ord"        = @("Beige", "Teal", "Sienna")
  "poplin-oversized-shirt"    = @("Ivory", "Navy", "Beige")
  "puff-sleeve-blouse"        = @("Ivory", "Coral", "Black")
  "ribbed-tank-top"           = @("Black", "Ivory", "Olive")
}

$productQuery = @'
query($q: String!) {
  products(first: 1, query: $q) {
    nodes {
      id
      title
      options { name optionValues { name } }
      variants(first: 100) {
        nodes { price selectedOptions { name value } }
      }
    }
  }
}
'@

$setMutation = @'
mutation($input: ProductSetInput!) {
  productSet(synchronous: true, input: $input) {
    product { id options { name optionValues { name } } variantsCount { count } }
    userErrors { field message }
  }
}
'@

$mode = if ($Remove) { "REMOVING Color option" } else { "ADDING Color option" }
Write-Host "=== Veylique product colours ($mode) ===" -ForegroundColor Cyan
Write-Host ""

$changed = 0
$skipped = 0
$failed = 0

foreach ($handle in $colorMap.Keys) {
  $colors = $colorMap[$handle]

  $found = Invoke-Gql $productQuery @{ q = "handle:$handle" }
  if ($found.products.nodes.Count -eq 0) {
    Write-Host "  missing:  $handle (no such product)" -ForegroundColor Yellow
    $skipped++
    continue
  }

  $product = $found.products.nodes[0]
  $optionNames = @($product.options | ForEach-Object { $_.name })
  $hasColor = $optionNames -contains "Color"

  # Sizes come from the product itself so we never assume the seeded set.
  $sizeOption = $product.options | Where-Object { $_.name -eq "Size" } | Select-Object -First 1
  if ($null -eq $sizeOption) {
    Write-Host "  skipped:  $handle (no Size option to combine with)" -ForegroundColor Yellow
    $skipped++
    continue
  }
  $sizes = @($sizeOption.optionValues | ForEach-Object { $_.name })

  # Every variant keeps the product's current price.
  $price = $product.variants.nodes[0].price

  if ($Remove) {
    if (-not $hasColor) {
      Write-Host "  skipped:  $($product.title) (no Color option)" -ForegroundColor DarkGray
      $skipped++
      continue
    }
    $variants = @()
    foreach ($s in $sizes) {
      $variants += @{ optionValues = @(@{ optionName = "Size"; name = $s }); price = $price }
    }
    $input = @{
      id             = $product.id
      productOptions = @(@{ name = "Size"; position = 1; values = @($sizes | ForEach-Object { @{ name = $_ } }) })
      variants       = $variants
    }
  }
  else {
    if ($hasColor) {
      Write-Host "  skipped:  $($product.title) (already has Color)" -ForegroundColor DarkGray
      $skipped++
      continue
    }
    $variants = @()
    foreach ($c in $colors) {
      foreach ($s in $sizes) {
        $variants += @{
          optionValues = @(
            @{ optionName = "Size";  name = $s },
            @{ optionName = "Color"; name = $c }
          )
          price = $price
        }
      }
    }
    $input = @{
      id             = $product.id
      productOptions = @(
        @{ name = "Size";  position = 1; values = @($sizes  | ForEach-Object { @{ name = $_ } }) },
        @{ name = "Color"; position = 2; values = @($colors | ForEach-Object { @{ name = $_ } }) }
      )
      variants = $variants
    }
  }

  $res = Invoke-Gql $setMutation @{ input = $input }
  if (Assert-NoUserErrors $res.productSet "update $($product.title)") {
    $count = $res.productSet.product.variantsCount.count
    if ($Remove) {
      Write-Host "  reverted: $($product.title)  ($count variants)" -ForegroundColor Green
    } else {
      Write-Host "  updated:  $($product.title)  [$($colors -join ', ')]  ($count variants)" -ForegroundColor Green
    }
    $changed++
  } else {
    $failed++
  }
}

Write-Host ""
Write-Host "Done. changed=$changed skipped=$skipped failed=$failed" -ForegroundColor Cyan
if (-not $Remove) {
  Write-Host "Next: Admin -> Apps -> Search & Discovery -> Filters -> Add filter -> Color." -ForegroundColor Yellow
}
