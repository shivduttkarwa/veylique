<#
.SYNOPSIS
  Attach local images to the seeded demo products via the Shopify Admin GraphQL
  API (staged uploads + productCreateMedia). Uses the CLI's stored store auth —
  no token.

.DESCRIPTION
  Prereq: `shopify store auth` already done (same as the seeder).

  Image -> product mapping (auto-detected per handle):
    * Option A (subfolder):  <ImagesRoot>/<handle>/*.jpg|png|webp
    * Option B (prefix):     <ImagesRoot>/<handle>-*.jpg|png|webp  (or <handle>.ext)
  Images are added in filename sort order; the first becomes the featured image.

  By default the existing (picsum placeholder) media is removed after the real
  images are attached. Pass -KeepPlaceholder to keep it.

.PARAMETER ImagesRoot
  Path to the folder containing the images (subfolders or prefixed files).

.PARAMETER Store
  myshopify domain. Defaults to veylique-development.myshopify.com.

.PARAMETER KeepPlaceholder
  Keep each product's existing media instead of replacing it.

.EXAMPLE
  .\scripts\add-product-images.ps1 -ImagesRoot "D:\Kailash\product-images"
#>
param(
  [Parameter(Mandatory = $true)][string]$ImagesRoot,
  [string]$Store = "veylique-development.myshopify.com",
  [switch]$KeepPlaceholder
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

if (-not (Test-Path $ImagesRoot)) { throw "ImagesRoot not found: $ImagesRoot" }

$tmp = Join-Path $env:TEMP "veylique-images"
New-Item -ItemType Directory -Force -Path $tmp | Out-Null

$handles = @(
  "mustard-wrap-midi-dress", "tiered-cotton-maxi-dress", "satin-slip-dress",
  "embroidered-kurta-set", "anarkali-flare-kurta", "block-print-cotton-kurti",
  "oversized-denim-jacket", "straight-leg-jeans", "ribbed-knit-sweater",
  "linen-shirt-shorts-co-ord", "satin-cami-trouser-set", "knit-lounge-co-ord",
  "poplin-oversized-shirt", "puff-sleeve-blouse", "ribbed-tank-top",
  "woven-straw-tote", "strappy-block-heels", "gold-layered-necklace"
)
$exts = @(".jpg", ".jpeg", ".png", ".webp")

function Invoke-Gql {
  param([string]$Query, $Variables)
  $qf = Join-Path $tmp "q.graphql"; $vf = Join-Path $tmp "v.json"; $rf = Join-Path $tmp "r.json"
  Set-Content -Path $qf -Value $Query -Encoding UTF8
  if ($null -eq $Variables) { $Variables = @{} }
  ($Variables | ConvertTo-Json -Depth 40) | Set-Content -Path $vf -Encoding UTF8
  shopify store execute --store $Store --query-file $qf --variable-file $vf --allow-mutations --json --output-file $rf 2>$null | Out-Null
  if (-not (Test-Path $rf)) { throw "No result from store execute (auth set up?)." }
  $res = Get-Content $rf -Raw | ConvertFrom-Json
  Remove-Item $rf -Force -ErrorAction SilentlyContinue
  if ($res.PSObject.Properties.Name -contains "errors" -and $res.errors) {
    throw "GraphQL error: $($res.errors | ConvertTo-Json -Depth 10)"
  }
  return $res
}

function Get-MimeType([string]$ext) {
  switch ($ext.ToLower()) {
    ".jpg"  { "image/jpeg" }
    ".jpeg" { "image/jpeg" }
    ".png"  { "image/png" }
    ".webp" { "image/webp" }
    default { "application/octet-stream" }
  }
}

function Get-ImagesForHandle([string]$handle) {
  $sub = Join-Path $ImagesRoot $handle
  if (Test-Path $sub -PathType Container) {
    return Get-ChildItem $sub -File | Where-Object { $exts -contains $_.Extension.ToLower() } | Sort-Object Name
  }
  # prefix match in root: "<handle>.ext" or "<handle>-*.ext"
  return Get-ChildItem $ImagesRoot -File |
    Where-Object { ($exts -contains $_.Extension.ToLower()) -and ($_.BaseName -eq $handle -or $_.BaseName -like "$handle-*") } |
    Sort-Object Name
}

# Upload one local file to Shopify staged storage, return its resourceUrl.
function Send-StagedUpload {
  param([System.IO.FileInfo]$File)
  $mime = Get-MimeType $File.Extension
  $stagedQuery = 'mutation($input: [StagedUploadInput!]!) { stagedUploadsCreate(input: $input) { stagedTargets { url resourceUrl parameters { name value } } userErrors { field message } } }'
  $vars = @{ input = @(@{ filename = $File.Name; mimeType = $mime; resource = "IMAGE"; httpMethod = "POST" }) }
  $r = Invoke-Gql $stagedQuery $vars
  if ($r.stagedUploadsCreate.userErrors) { throw "stagedUploadsCreate: $($r.stagedUploadsCreate.userErrors | ConvertTo-Json)" }
  $target = $r.stagedUploadsCreate.stagedTargets[0]

  # Build multipart form: all returned params first, file last (GCS requires this order).
  $form = [ordered]@{}
  foreach ($p in $target.parameters) { $form[$p.name] = $p.value }
  $form["file"] = Get-Item $File.FullName
  Invoke-RestMethod -Uri $target.url -Method Post -Form $form | Out-Null
  return $target.resourceUrl
}

# ============================================================================
Write-Host "=== Attaching product images from $ImagesRoot ===" -ForegroundColor Cyan
$attached = 0; $skipped = 0

foreach ($handle in $handles) {
  $imgs = Get-ImagesForHandle $handle
  if (-not $imgs -or $imgs.Count -eq 0) {
    Write-Host "  - $handle : no images found, skipping" -ForegroundColor DarkGray
    $skipped++
    continue
  }

  # Look up product + its current media.
  $p = Invoke-Gql 'query($q: String!) { products(first: 1, query: $q) { nodes { id title media(first: 50) { nodes { id } } } } }' @{ q = "handle:$handle" }
  if ($p.products.nodes.Count -eq 0) {
    Write-Host "  - $handle : product not found, skipping" -ForegroundColor Yellow
    $skipped++
    continue
  }
  $product = $p.products.nodes[0]
  $oldMediaIds = @($product.media.nodes | ForEach-Object { $_.id })

  # Upload each image and build the media input.
  $mediaInput = @()
  foreach ($img in $imgs) {
    Write-Host "      uploading $($img.Name)..." -ForegroundColor DarkGray
    $resourceUrl = Send-StagedUpload $img
    $mediaInput += @{ originalSource = $resourceUrl; mediaContentType = "IMAGE"; alt = $product.title }
  }

  $create = Invoke-Gql 'mutation($pid: ID!, $media: [CreateMediaInput!]!) { productCreateMedia(productId: $pid, media: $media) { media { ... on MediaImage { id } } mediaUserErrors { field message } } }' @{ pid = $product.id; media = $mediaInput }
  if ($create.productCreateMedia.mediaUserErrors) {
    Write-Warning "  $handle -> $($create.productCreateMedia.mediaUserErrors | ConvertTo-Json)"
    continue
  }

  # Replace placeholder: delete the previously-existing media.
  if (-not $KeepPlaceholder -and $oldMediaIds.Count -gt 0) {
    Invoke-Gql 'mutation($pid: ID!, $ids: [ID!]!) { productDeleteMedia(productId: $pid, mediaIds: $ids) { deletedMediaIds mediaUserErrors { field message } } }' @{ pid = $product.id; ids = $oldMediaIds } | Out-Null
  }

  Write-Host "  + $handle : added $($imgs.Count) image(s)$(if (-not $KeepPlaceholder) { ', replaced placeholder' })" -ForegroundColor Green
  $attached++
}

Write-Host ""
Write-Host "Done. $attached product(s) updated, $skipped skipped." -ForegroundColor Green
