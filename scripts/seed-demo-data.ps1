<#
.SYNOPSIS
  Create (or remove) demo collections + products on the Veylique dev store using
  the Shopify CLI's Admin GraphQL API (`shopify store execute`) — no token, no
  custom app, no Dev Dashboard.

.DESCRIPTION
  Prereq (run once, interactive browser login):
    shopify store auth --store veylique-development.myshopify.com --scopes write_products,read_products,write_publications,read_publications

  Then this script (idempotent) creates:
    * 9 smart collections (rule = product tag) mapping to the home-page sections:
      6 categories + New Arrivals + Bestsellers + Latest Products.
    * 18 women's-fashion demo products (Size variants, prices, tags, image).
  Every product/collection is explicitly published to the Online Store channel
  (Admin API does NOT auto-publish in 2026-07). Everything is tagged
  "veylique-demo" so -Remove can clean it all up.

.PARAMETER Store
  myshopify domain. Defaults to veylique-development.myshopify.com.

.PARAMETER Remove
  Delete all demo products (tag veylique-demo) and the demo collections instead
  of creating them.

.EXAMPLE
  .\scripts\seed-demo-data.ps1
  .\scripts\seed-demo-data.ps1 -Remove
#>
param(
  [string]$Store = "veylique-development.myshopify.com",
  [switch]$Remove
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$tmp = Join-Path $env:TEMP "veylique-seed"
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
  # `shopify store execute --json` returns the GraphQL `data` object directly
  # (no {data, errors} envelope). Top-level `errors` only appears on failure.
  if ($res.PSObject.Properties.Name -contains "errors" -and $res.errors) {
    throw "GraphQL error: $($res.errors | ConvertTo-Json -Depth 10)"
  }
  return $res
}

function Assert-NoUserErrors {
  param($Node, [string]$What)
  if ($Node -and ($Node.PSObject.Properties.Name -contains "userErrors") -and $Node.userErrors) {
    Write-Warning "$What -> $($Node.userErrors | ConvertTo-Json -Depth 10)"
    return $false
  }
  return $true
}

# --- Demo definitions -------------------------------------------------------
$collections = @(
  @{ handle = "dresses";         title = "Dresses";         tag = "dresses" },
  @{ handle = "ethnic-wear";     title = "Ethnic Wear";     tag = "ethnic-wear" },
  @{ handle = "western-wear";    title = "Western Wear";    tag = "western-wear" },
  @{ handle = "co-ord-sets";     title = "Co-ord Sets";     tag = "co-ord-sets" },
  @{ handle = "tops-shirts";     title = "Tops & Shirts";   tag = "tops-shirts" },
  @{ handle = "accessories";     title = "Accessories";     tag = "accessories" },
  @{ handle = "new-arrivals";    title = "New Arrivals";    tag = "new" },
  @{ handle = "bestsellers";     title = "Bestsellers";     tag = "bestseller" },
  @{ handle = "latest-products"; title = "Latest Products"; tag = "veylique-demo" }
)

$apparel = @("XS", "S", "M", "L", "XL")
$products = @(
  @{ title = "Mustard Wrap Midi Dress";     type = "Dress";      price = "68.00";  sizes = $apparel;           tags = @("dresses","bestseller") },
  @{ title = "Tiered Cotton Maxi Dress";    type = "Dress";      price = "89.00";  sizes = $apparel;           tags = @("dresses","bestseller") },
  @{ title = "Satin Slip Dress";            type = "Dress";      price = "78.00";  sizes = $apparel;           tags = @("dresses","new") },
  @{ title = "Embroidered Kurta Set";       type = "Kurta Set";  price = "96.00";  sizes = $apparel;           tags = @("ethnic-wear","bestseller") },
  @{ title = "Anarkali Flare Kurta";        type = "Kurta";      price = "110.00"; sizes = $apparel;           tags = @("ethnic-wear") },
  @{ title = "Block-Print Cotton Kurti";    type = "Kurti";      price = "54.00";  sizes = $apparel;           tags = @("ethnic-wear","new") },
  @{ title = "Oversized Denim Jacket";      type = "Jacket";     price = "98.00";  sizes = $apparel;           tags = @("western-wear","bestseller") },
  @{ title = "Straight Leg Jeans";          type = "Jeans";      price = "74.00";  sizes = $apparel;           tags = @("western-wear","bestseller") },
  @{ title = "Ribbed Knit Sweater";         type = "Knitwear";   price = "58.00";  sizes = $apparel;           tags = @("western-wear","new") },
  @{ title = "Linen Shirt & Shorts Co-ord"; type = "Co-ord Set"; price = "92.00";  sizes = $apparel;           tags = @("co-ord-sets","bestseller") },
  @{ title = "Satin Cami & Trouser Set";    type = "Co-ord Set"; price = "104.00"; sizes = $apparel;           tags = @("co-ord-sets") },
  @{ title = "Knit Lounge Co-ord";          type = "Co-ord Set"; price = "84.00";  sizes = $apparel;           tags = @("co-ord-sets","new") },
  @{ title = "Poplin Oversized Shirt";      type = "Shirt";      price = "48.00";  sizes = $apparel;           tags = @("tops-shirts","bestseller") },
  @{ title = "Puff Sleeve Blouse";          type = "Top";        price = "52.00";  sizes = $apparel;           tags = @("tops-shirts") },
  @{ title = "Ribbed Tank Top";             type = "Top";        price = "36.00";  sizes = $apparel;           tags = @("tops-shirts","new") },
  @{ title = "Woven Straw Tote";            type = "Bag";        price = "48.00";  sizes = @("One Size");      tags = @("accessories","bestseller") },
  @{ title = "Strappy Block Heels";         type = "Footwear";   price = "64.00";  sizes = @("6","7","8","9"); tags = @("accessories") },
  @{ title = "Gold Layered Necklace";       type = "Jewellery";  price = "32.00";  sizes = @("One Size");      tags = @("accessories","new") }
)

function Get-Handle([string]$title) {
  return ($title.ToLower() -replace "[^a-z0-9]+", "-").Trim("-")
}

# ============================================================================
# REMOVE
# ============================================================================
if ($Remove) {
  Write-Host "Removing demo products (tag veylique-demo) and demo collections..." -ForegroundColor Yellow

  $data = Invoke-Gql 'query { products(first: 250, query: "tag:veylique-demo") { nodes { id title } } }'
  foreach ($p in $data.products.nodes) {
    $d = Invoke-Gql 'mutation($id: ID!) { productDelete(input: { id: $id }) { deletedProductId userErrors { message } } }' @{ id = $p.id }
    if (Assert-NoUserErrors $d.productDelete "delete $($p.title)") {
      Write-Host "  deleted product: $($p.title)" -ForegroundColor DarkGray
    }
  }
  foreach ($c in $collections) {
    $found = Invoke-Gql 'query($q: String!) { collections(first: 1, query: $q) { nodes { id handle } } }' @{ q = "handle:$($c.handle)" }
    if ($found.collections.nodes.Count -gt 0) {
      $id = $found.collections.nodes[0].id
      $d = Invoke-Gql 'mutation($id: ID!) { collectionDelete(input: { id: $id }) { deletedCollectionId userErrors { message } } }' @{ id = $id }
      if (Assert-NoUserErrors $d.collectionDelete "delete $($c.handle)") {
        Write-Host "  deleted collection: $($c.handle)" -ForegroundColor DarkGray
      }
    }
  }
  Write-Host "Done removing demo data." -ForegroundColor Green
  return
}

# ============================================================================
# CREATE
# ============================================================================
Write-Host "=== Seeding Veylique demo data on $Store ===" -ForegroundColor Cyan

# --- 0. Find the Online Store publication -----------------------------------
Write-Host ""
Write-Host "[0/3] Locating Online Store publication..." -ForegroundColor Cyan
$pubs = Invoke-Gql 'query { publications(first: 20) { nodes { id name } } }'
$onlineStore = $pubs.publications.nodes | Where-Object { $_.name -eq "Online Store" } | Select-Object -First 1
if (-not $onlineStore) { throw "Could not find an 'Online Store' publication. Available: $($pubs.publications.nodes.name -join ', ')" }
$onlineStoreId = $onlineStore.id
Write-Host "  Online Store: $onlineStoreId" -ForegroundColor DarkGray

$publishMutation = 'mutation($id: ID!, $input: [PublicationInput!]!) { publishablePublish(id: $id, input: $input) { userErrors { field message } } }'

# --- 1. Collections ---------------------------------------------------------
Write-Host ""
Write-Host "[1/3] Creating + publishing smart collections..." -ForegroundColor Cyan
foreach ($c in $collections) {
  $found = Invoke-Gql 'query($q: String!) { collections(first: 1, query: $q) { nodes { id handle } } }' @{ q = "handle:$($c.handle)" }
  if ($found.collections.nodes.Count -gt 0) {
    Write-Host "  exists: $($c.title)" -ForegroundColor DarkGray
    continue
  }
  $input = @{
    title         = $c.title
    handle        = $c.handle
    descriptionHtml = "<p>$($c.title) — demo collection.</p>"
    ruleSet       = @{
      appliedDisjunctively = $false
      rules = @(@{ column = "TAG"; relation = "EQUALS"; condition = $c.tag })
    }
  }
  $r = Invoke-Gql 'mutation($input: CollectionInput!) { collectionCreate(input: $input) { collection { id } userErrors { field message } } }' @{ input = $input }
  if (Assert-NoUserErrors $r.collectionCreate "create $($c.title)") {
    $id = $r.collectionCreate.collection.id
    Invoke-Gql $publishMutation @{ id = $id; input = @(@{ publicationId = $onlineStoreId }) } | Out-Null
    Write-Host "  created + published: $($c.title)  (tag: $($c.tag))" -ForegroundColor Green
  }
}

# --- 2. Products ------------------------------------------------------------
Write-Host ""
Write-Host "[2/3] Creating + publishing products..." -ForegroundColor Cyan
$index = 0
foreach ($p in $products) {
  $index++
  $handle = Get-Handle $p.title
  $found = Invoke-Gql 'query($q: String!) { products(first: 1, query: $q) { nodes { id } } }' @{ q = "handle:$handle" }
  if ($found.products.nodes.Count -gt 0) {
    Write-Host "  exists: $($p.title)" -ForegroundColor DarkGray
    continue
  }

  $optionValues = @()
  $variants = @()
  foreach ($s in $p.sizes) {
    $optionValues += @{ name = $s }
    $variants += @{ optionValues = @(@{ optionName = "Size"; name = $s }); price = $p.price }
  }
  $allTags = @($p.tags) + @("veylique-demo")
  $img = "https://picsum.photos/seed/veylique-$index/1000/1250"

  $input = @{
    title          = $p.title
    handle         = $handle
    descriptionHtml = "<p>Demo product for design testing — $($p.type) in the Veylique collection.</p>"
    vendor         = "Veylique"
    productType    = $p.type
    status         = "ACTIVE"
    tags           = $allTags
    productOptions = @(@{ name = "Size"; position = 1; values = $optionValues })
    variants       = $variants
    files          = @(@{ originalSource = $img; contentType = "IMAGE" })
  }
  $r = Invoke-Gql 'mutation($input: ProductSetInput!) { productSet(synchronous: true, input: $input) { product { id } userErrors { field message } } }' @{ input = $input }
  if (Assert-NoUserErrors $r.productSet "create $($p.title)") {
    $id = $r.productSet.product.id
    Invoke-Gql $publishMutation @{ id = $id; input = @(@{ publicationId = $onlineStoreId }) } | Out-Null
    Write-Host "  created + published: $($p.title)  (`$$($p.price))  [$($p.tags -join ', ')]" -ForegroundColor Green
  }
}

Write-Host ""
Write-Host "[3/3] Done. Collections + products seeded and published to Online Store." -ForegroundColor Green
Write-Host "Next: I'll wire the home-section 'collection' settings to these handles in index.json." -ForegroundColor Yellow
