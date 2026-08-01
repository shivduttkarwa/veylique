<#
.SYNOPSIS
  Rebuild the Veylique catalogue: wipe the old demo products, create the 10
  current-season products (3 photos each) and the collections the home page
  is wired to. Uses the Shopify CLI's Admin GraphQL API (`shopify store
  execute`) — no token, no custom app.

.DESCRIPTION
  Prereq (run once, interactive browser login):
    shopify store auth --store veylique-development.myshopify.com --scopes write_products,read_products,write_publications,read_publications,write_files

  What it does, in order:
    1. DELETE every product except the ones in $keepHandles.
    2. COLLECTIONS — create the 6 category smart collections the home page
       needs (Outerwear, Dresses, Tailoring, Knitwear, Women, Men) plus
       New Arrivals / Bestsellers / Latest Products, and delete the retired
       ones (Ethnic Wear, Western Wear, Co-ord Sets, Tops & Shirts,
       Accessories).
    3. RETAG + REPRICE the kept products into the new taxonomy and price band.
    4. CREATE the 10 new products (Size variants, INR prices, tags, copy) and
       publish each to the Online Store.
    5. IMAGES — staged-upload the 3 local photos per product and attach them,
       hero shot first.

  Idempotent: re-running skips products/collections that already exist. Pass
  -Force to delete and recreate the 10 new products from scratch.

  Variants are created with inventory tracking OFF (matching the rest of the
  demo store) so nothing shows as sold out.

.PARAMETER Store
  myshopify domain. Defaults to veylique-development.myshopify.com.

.PARAMETER ImagesRoot
  Folder holding the product photos. Defaults to
  <repo>/assets/latest-product-images.

.PARAMETER SkipImages
  Create products/collections but don't upload photos.

.PARAMETER SkipDelete
  Leave the existing products alone (additive run only).

.PARAMETER Force
  Delete + recreate the 10 new products even if they already exist.

.EXAMPLE
  .\scripts\seed-catalogue.ps1
  .\scripts\seed-catalogue.ps1 -SkipImages
  .\scripts\seed-catalogue.ps1 -Force
#>
param(
  [string]$Store = "veylique-development.myshopify.com",
  [string]$ImagesRoot,
  [switch]$SkipImages,
  [switch]$SkipDelete,
  [switch]$Force
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
if ([string]::IsNullOrWhiteSpace($ImagesRoot)) {
  $ImagesRoot = Join-Path $repoRoot "assets/latest-product-images"
}

$tmp = Join-Path $env:TEMP "veylique-catalogue"
New-Item -ItemType Directory -Force -Path $tmp | Out-Null

# --- Run a GraphQL query/mutation via the CLI (uses stored store auth) -------
function Invoke-Gql {
  param([string]$Query, $Variables, [int]$Retries = 3)
  $qf = Join-Path $tmp "query.graphql"
  $vf = Join-Path $tmp "vars.json"
  $rf = Join-Path $tmp "result.json"
  Set-Content -Path $qf -Value $Query -Encoding UTF8
  if ($null -eq $Variables) { $Variables = @{} }
  ($Variables | ConvertTo-Json -Depth 40) | Set-Content -Path $vf -Encoding UTF8

  # The CLI occasionally drops a call (transient auth/network); a rebuild makes
  # ~60 of them, so retry rather than abandoning a half-finished catalogue.
  for ($attempt = 1; $attempt -le $Retries; $attempt++) {
    Remove-Item $rf -Force -ErrorAction SilentlyContinue
    shopify store execute --store $Store --query-file $qf --variable-file $vf `
      --allow-mutations --json --output-file $rf 2>$null | Out-Null
    if (Test-Path $rf) { break }
    if ($attempt -eq $Retries) { throw "No result from store execute after $Retries attempts (is auth set up?)." }
    Write-Host "      store execute returned nothing, retrying ($attempt/$Retries)..." -ForegroundColor DarkYellow
    Start-Sleep -Seconds (2 * $attempt)
  }

  $res = Get-Content $rf -Raw | ConvertFrom-Json
  Remove-Item $rf -Force -ErrorAction SilentlyContinue
  # `shopify store execute --json` returns the GraphQL `data` object directly.
  if ($res.PSObject.Properties.Name -contains "errors" -and $res.errors) {
    throw "GraphQL error: $($res.errors | ConvertTo-Json -Depth 10)"
  }
  return $res
}

function Assert-NoUserErrors {
  param($Node, [string]$What)
  if ($Node -and ($Node.PSObject.Properties.Name -contains "userErrors") -and $Node.userErrors) {
    Write-Warning "$What -> $($Node.userErrors | ConvertTo-Json -Depth 10 -Compress)"
    return $false
  }
  return $true
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

# Upload one local file to Shopify staged storage, return its resourceUrl.
function Send-StagedUpload {
  param([System.IO.FileInfo]$File)
  $mime = Get-MimeType $File.Extension
  $stagedQuery = 'mutation($input: [StagedUploadInput!]!) { stagedUploadsCreate(input: $input) { stagedTargets { url resourceUrl parameters { name value } } userErrors { field message } } }'
  $vars = @{ input = @(@{ filename = $File.Name; mimeType = $mime; resource = "IMAGE"; httpMethod = "POST" }) }
  $r = Invoke-Gql $stagedQuery $vars
  if ($r.stagedUploadsCreate.userErrors) { throw "stagedUploadsCreate: $($r.stagedUploadsCreate.userErrors | ConvertTo-Json -Compress)" }
  $target = $r.stagedUploadsCreate.stagedTargets[0]

  # Upload via curl.exe: GCS/S3 staged targets are strict about multipart form
  # encoding (PowerShell's -Form produces a body they reject). All returned
  # params go first, in order, then the file field last.
  $curlArgs = @('--silent', '--show-error', '--fail')
  foreach ($p in $target.parameters) {
    $curlArgs += '-F'
    $curlArgs += ('{0}={1}' -f $p.name, $p.value)
  }
  $curlArgs += '-F'
  $curlArgs += ('file=@{0};type={1}' -f $File.FullName, $mime)
  $curlArgs += $target.url

  $out = & curl.exe @curlArgs 2>&1
  if ($LASTEXITCODE -ne 0) { throw "curl upload failed for $($File.Name): $out" }
  return $target.resourceUrl
}

# ============================================================================
# CATALOGUE DEFINITION
# ============================================================================

# Products that survive the wipe (they carry real photography + copy already).
$keepHandles = @("graphite-leather-bomber", "cobalt-oversized-blazer")

# Retag/reprice the survivors into the new taxonomy + price band.
$keepUpdates = @(
  @{ handle = "graphite-leather-bomber"; price = 14000; tags = @("outerwear","women","new","bestseller","veylique-demo") },
  @{ handle = "cobalt-oversized-blazer"; price = 11000; tags = @("tailoring","women","new","bestseller","veylique-demo") }
)

# Smart collections the home page (templates/index.json) is wired to.
$collections = @(
  @{ handle = "outerwear";       title = "Outerwear";       tag = "outerwear";     desc = "Trenches, bombers and suede — the layer that finishes the look." },
  @{ handle = "dresses";         title = "Dresses";         tag = "dresses";       desc = "Satin, suiting and everything between." },
  @{ handle = "tailoring";       title = "Tailoring";       tag = "tailoring";     desc = "Considered cuts in wool, crepe and flannel." },
  @{ handle = "knitwear";        title = "Knitwear";        tag = "knitwear";      desc = "Fine-gauge ribs and textured knits, built to layer." },
  @{ handle = "women";           title = "Women";           tag = "women";         desc = "The full women's collection." },
  @{ handle = "men";             title = "Men";             tag = "men";           desc = "The full men's collection." },
  @{ handle = "new-arrivals";    title = "New Arrivals";    tag = "new";           desc = "The newest pieces to land in the collection." },
  @{ handle = "bestsellers";     title = "Bestsellers";     tag = "bestseller";    desc = "Our most-loved styles." },
  @{ handle = "latest-products"; title = "Latest Products"; tag = "veylique-demo"; desc = "Everything in the current collection." }
)

# Collections from the old women's-only taxonomy that no longer have products.
$retiredCollections = @("ethnic-wear", "western-wear", "co-ord-sets", "tops-shirts", "accessories")

$womens = @("XS", "S", "M", "L", "XL")
$mens   = @("S", "M", "L", "XL", "XXL")

# The 10 new products. `images` are filenames under $ImagesRoot, hero first.
$products = @(
  @{
    handle = "ivory-architectural-trench"
    title  = "Ivory Architectural Trench"
    type   = "Trench Coat"
    price  = 22000
    sizes  = $womens
    tags   = @("outerwear", "women", "new", "bestseller")
    desc   = "A belted trench in soft-structured ivory leather, cut long and easy through the body. Oversized notch lapels and a dropped shoulder give it the architectural line; the self-belt with covered buckle lets you decide how much of it you keep. Deep patch pockets, clean topstitched seams, no lining to fight you. Wear it open over matching ivory tailoring, or belted with denim."
    images = @("product-01-womens-ivory-architectural-trench.webp", "product-01-womens-ivory-architectural-trench-detail-1.webp", "product-01-womens-ivory-architectural-trench-detail-2.webp")
  },
  @{
    handle = "emerald-satin-wrap-dress"
    title  = "Emerald Satin Wrap Dress"
    type   = "Dress"
    price  = 12500
    sizes  = $womens
    tags   = @("dresses", "women", "new", "bestseller")
    desc   = "Deep emerald satin with enough weight to hold a fold. The surplice neckline crosses into a ruched wrap waist, and the skirt falls into a tulip hem with a front slit that moves when you do. Blouson sleeves gather into buttoned cuffs. Midi length, fully lined, and the colour does the rest."
    images = @("product-02-womens-emerald-satin-wrap-dress.webp", "product-02-womens-emerald-satin-wrap-dress-detail-1.webp", "product-02-womens-emerald-satin-wrap-dress-detail-2.webp")
  },
  @{
    handle = "oxblood-suede-jacket"
    title  = "Oxblood Suede Jacket"
    type   = "Jacket"
    price  = 24000
    sizes  = $womens
    tags   = @("outerwear", "women", "bestseller")
    desc   = "Cropped and boxy in dense oxblood suede, with a stand collar that holds itself up and a concealed placket that keeps the front uninterrupted. Panelled seams shape the body without darts; the hem sits exactly at the waistband. A jacket that reads as a colour first and a shape second."
    images = @("product-03-womens-oxblood-suede-jacket.webp", "product-03-womens-oxblood-suede-jacket-detail-1.webp", "product-03-womens-oxblood-suede-jacket-detail-2.webp")
  },
  @{
    handle = "graphite-blazer-dress"
    title  = "Graphite Blazer Dress"
    type   = "Dress"
    price  = 15000
    sizes  = $womens
    tags   = @("dresses", "tailoring", "women", "new")
    desc   = "A sleeveless blazer dress in graphite wool-blend suiting. Peak lapels and a squared shoulder set the line; the waist is cut in and the double-breasted front wraps to an asymmetric hem. Flap pockets, horn-look buttons, half-lined. Bare-armed tailoring that needs nothing else."
    images = @("product-04-womens-graphite-blazer-dress.webp", "product-04-womens-graphite-blazer-dress-detail-1.webp", "product-04-womens-graphite-blazer-dress-detail-2.webp")
  },
  @{
    handle = "cobalt-asymmetric-knit-top"
    title  = "Cobalt Asymmetric Knit Top"
    type   = "Knitwear"
    price  = 8500
    sizes  = $womens
    tags   = @("knitwear", "women", "new")
    desc   = "Fine-rib knit in saturated cobalt, cut on an asymmetric line that leaves one shoulder bare and gathers the other into a soft puff. Body-skimming through the waist with extra-long cuffs that push up and stay. Tuck it into wide ivory trousers and let the neckline do the talking."
    images = @("product-05-womens-cobalt-asymmetric-knit-top.webp", "product-05-womens-cobalt-asymmetric-knit-top-detail-1.webp", "product-05-womens-cobalt-asymmetric-knit-top-detail-2.webp")
  },
  @{
    handle = "camel-wool-overshirt"
    title  = "Camel Wool Overshirt"
    type   = "Overshirt"
    price  = 16500
    sizes  = $mens
    tags   = @("outerwear", "men", "new", "bestseller")
    desc   = "Brushed camel wool cut as a shirt and worn as a jacket. Point collar, concealed press studs, two deep patch pockets and a straight hem that sits at the hip. Unlined, so it layers over a crewneck without bulk and under a coat when it turns. The most useful thing in a cold-weather wardrobe."
    images = @("product-06-mens-camel-wool-overshirt.webp", "product-06-mens-camel-wool-overshirt-detail-1.webp", "product-06-mens-camel-wool-overshirt-detail-2.webp")
  },
  @{
    handle = "charcoal-double-breasted-blazer"
    title  = "Charcoal Double-Breasted Blazer"
    type   = "Blazer"
    price  = 21000
    sizes  = $mens
    tags   = @("tailoring", "men", "bestseller")
    desc   = "Charcoal flannel with a dry, matte handle and a soft Neapolitan shoulder. Wide peak lapels roll to a six-on-two front; flap pockets, working cuffs, half-lined so it breathes. Cut with room through the chest rather than pinned to it. Over a cream crewneck it stops looking like a suit jacket entirely."
    images = @("product-07-mens-charcoal-double-breasted-blazer.webp", "product-07-mens-charcoal-double-breasted-blazer-detail-1.webp", "product-07-mens-charcoal-double-breasted-blazer-detail-2.webp")
  },
  @{
    handle = "forest-green-suede-bomber"
    title  = "Forest Green Suede Bomber"
    type   = "Jacket"
    price  = 24000
    sizes  = $mens
    tags   = @("outerwear", "men", "new", "bestseller")
    desc   = "Supple forest-green suede in a clean bomber line. Stand collar, two-way zip, raglan sleeves for an unbroken shoulder, and ribbed collar, cuffs and hem that hold the shape. Slash pockets set into the seam. Deep enough in colour to work like a neutral, rich enough that it never reads as one."
    images = @("product-08-mens-forest-green-suede-bomber.webp", "product-08-mens-forest-green-suede-bomber-detail-1.webp", "product-08-mens-forest-green-suede-bomber-detail-2.webp")
  },
  @{
    handle = "ivory-textured-knit-polo"
    title  = "Ivory Textured Knit Polo"
    type   = "Knitwear"
    price  = 9500
    sizes  = $mens
    tags   = @("knitwear", "men", "new")
    desc   = "A knitted polo in ivory cotton-blend, worked in a textured rib that catches the light without pattern. Open johnny collar — no buttons, no placket — so it sits flat under a jacket. Ribbed cuffs and hem, regular fit through the body. The shirt alternative that still counts as a shirt."
    images = @("product-09-mens-ivory-textured-knit-polo.webp", "product-09-mens-ivory-textured-knit-polo-detail-1.webp", "product-09-mens-ivory-textured-knit-polo-detail-2.webp")
  },
  @{
    handle = "midnight-navy-technical-trench"
    title  = "Midnight Navy Technical Trench"
    type   = "Trench Coat"
    price  = 19500
    sizes  = $mens
    tags   = @("outerwear", "men", "bestseller")
    desc   = "A trench in midnight navy technical cotton — tightly woven, water-repellent, and completely matte. Stand-away collar, concealed press-stud placket, buckled self-belt and buttoned cuff tabs. Knee length with slanted welt pockets set deep enough to actually use. Built for weather, cut for the office."
    images = @("product-10-mens-midnight-navy-technical-trench.webp", "product-10-mens-midnight-navy-technical-trench-detail-1.webp", "product-10-mens-midnight-navy-technical-trench-detail-2.webp")
  }
)

# ============================================================================
Write-Host "=== Rebuilding the Veylique catalogue on $Store ===" -ForegroundColor Cyan

# --- 0. Online Store publication --------------------------------------------
Write-Host ""
Write-Host "[0/5] Locating Online Store publication..." -ForegroundColor Cyan
$pubs = Invoke-Gql 'query { publications(first: 20) { nodes { id name } } }'
$onlineStore = $pubs.publications.nodes | Where-Object { $_.name -eq "Online Store" } | Select-Object -First 1
if (-not $onlineStore) { throw "Could not find an 'Online Store' publication. Available: $($pubs.publications.nodes.name -join ', ')" }
$onlineStoreId = $onlineStore.id
Write-Host "  Online Store: $onlineStoreId" -ForegroundColor DarkGray

$publishMutation = 'mutation($id: ID!, $input: [PublicationInput!]!) { publishablePublish(id: $id, input: $input) { userErrors { field message } } }'
$productDelete   = 'mutation($id: ID!) { productDelete(input: { id: $id }) { deletedProductId userErrors { message } } }'

# --- 1. Wipe the old catalogue ----------------------------------------------
Write-Host ""
if ($SkipDelete) {
  Write-Host "[1/5] Skipping product deletion (-SkipDelete)." -ForegroundColor Yellow
} else {
  Write-Host "[1/5] Deleting existing products (keeping $($keepHandles -join ', '))..." -ForegroundColor Cyan
  $newHandles = @($products | ForEach-Object { $_.handle })
  $all = Invoke-Gql 'query { products(first: 250) { nodes { id title handle } } }'
  $deleted = 0
  foreach ($p in $all.products.nodes) {
    if ($keepHandles -contains $p.handle) {
      Write-Host "  keeping: $($p.title)" -ForegroundColor DarkCyan
      continue
    }
    # Only re-create the new products when -Force is given.
    if (-not $Force -and $newHandles -contains $p.handle) {
      Write-Host "  keeping: $($p.title) (already seeded)" -ForegroundColor DarkCyan
      continue
    }
    $d = Invoke-Gql $productDelete @{ id = $p.id }
    if (Assert-NoUserErrors $d.productDelete "delete $($p.title)") {
      Write-Host "  deleted: $($p.title)" -ForegroundColor DarkGray
      $deleted++
    }
  }
  Write-Host "  $deleted product(s) deleted." -ForegroundColor Yellow
}

# --- 2. Collections ---------------------------------------------------------
Write-Host ""
Write-Host "[2/5] Syncing smart collections..." -ForegroundColor Cyan
foreach ($c in $collections) {
  $found = Invoke-Gql 'query($q: String!) { collections(first: 1, query: $q) { nodes { id handle } } }' @{ q = "handle:$($c.handle)" }
  if ($found.collections.nodes.Count -gt 0) {
    Write-Host "  exists: $($c.title)" -ForegroundColor DarkGray
    continue
  }
  $input = @{
    title           = $c.title
    handle          = $c.handle
    descriptionHtml = "<p>$($c.desc)</p>"
    ruleSet         = @{
      appliedDisjunctively = $false
      rules = @(@{ column = "TAG"; relation = "EQUALS"; condition = $c.tag })
    }
  }
  $r = Invoke-Gql 'mutation($input: CollectionInput!) { collectionCreate(input: $input) { collection { id } userErrors { field message } } }' @{ input = $input }
  if (Assert-NoUserErrors $r.collectionCreate "create $($c.title)") {
    Invoke-Gql $publishMutation @{ id = $r.collectionCreate.collection.id; input = @(@{ publicationId = $onlineStoreId }) } | Out-Null
    Write-Host "  created + published: $($c.title)  (tag: $($c.tag))" -ForegroundColor Green
  }
}
foreach ($handle in $retiredCollections) {
  $found = Invoke-Gql 'query($q: String!) { collections(first: 1, query: $q) { nodes { id } } }' @{ q = "handle:$handle" }
  if ($found.collections.nodes.Count -eq 0) { continue }
  $d = Invoke-Gql 'mutation($id: ID!) { collectionDelete(input: { id: $id }) { deletedCollectionId userErrors { message } } }' @{ id = $found.collections.nodes[0].id }
  if (Assert-NoUserErrors $d.collectionDelete "delete $handle") {
    Write-Host "  retired: $handle" -ForegroundColor DarkGray
  }
}

# --- 3. Retag + reprice the kept products -----------------------------------
Write-Host ""
Write-Host "[3/5] Updating the kept products..." -ForegroundColor Cyan
foreach ($k in $keepUpdates) {
  $found = Invoke-Gql 'query($q: String!) { products(first: 1, query: $q) { nodes { id title tags variants(first: 100) { nodes { id } } } } }' @{ q = "handle:$($k.handle)" }
  if ($found.products.nodes.Count -eq 0) {
    Write-Host "  missing: $($k.handle)" -ForegroundColor Yellow
    continue
  }
  $prod = $found.products.nodes[0]

  # Replace the tag set outright so the old taxonomy tags are dropped.
  $u = Invoke-Gql 'mutation($input: ProductInput!) { productUpdate(input: $input) { product { id } userErrors { field message } } }' `
    @{ input = @{ id = $prod.id; tags = $k.tags } }
  Assert-NoUserErrors $u.productUpdate "retag $($k.handle)" | Out-Null

  $variants = @($prod.variants.nodes | ForEach-Object { @{ id = $_.id; price = "$($k.price).00" } })
  $v = Invoke-Gql 'mutation($productId: ID!, $variants: [ProductVariantsBulkInput!]!) { productVariantsBulkUpdate(productId: $productId, variants: $variants) { product { id } userErrors { field message } } }' `
    @{ productId = $prod.id; variants = $variants }
  Assert-NoUserErrors $v.productVariantsBulkUpdate "reprice $($k.handle)" | Out-Null

  Write-Host "  updated: $($prod.title)  (Rs. $($k.price))  [$($k.tags -join ', ')]" -ForegroundColor Green
}

# --- 4. Create the new products ---------------------------------------------
Write-Host ""
Write-Host "[4/5] Creating + publishing products..." -ForegroundColor Cyan
$createdIds = @{}
foreach ($p in $products) {
  $found = Invoke-Gql 'query($q: String!) { products(first: 1, query: $q) { nodes { id } } }' @{ q = "handle:$($p.handle)" }
  if ($found.products.nodes.Count -gt 0) {
    Write-Host "  exists: $($p.title)" -ForegroundColor DarkGray
    $createdIds[$p.handle] = $found.products.nodes[0].id
    continue
  }

  $optionValues = @()
  $variants = @()
  foreach ($s in $p.sizes) {
    $optionValues += @{ name = $s }
    $variants += @{
      optionValues  = @(@{ optionName = "Size"; name = $s })
      price         = "$($p.price).00"
      # Untracked inventory keeps every size purchasable on the demo store.
      inventoryItem = @{ tracked = $false }
    }
  }

  $input = @{
    title           = $p.title
    handle          = $p.handle
    descriptionHtml = "<p>$($p.desc)</p>"
    vendor          = "Veylique"
    productType     = $p.type
    status          = "ACTIVE"
    tags            = @($p.tags) + @("veylique-demo")
    productOptions  = @(@{ name = "Size"; position = 1; values = $optionValues })
    variants        = $variants
  }
  $r = Invoke-Gql 'mutation($input: ProductSetInput!) { productSet(synchronous: true, input: $input) { product { id } userErrors { field message } } }' @{ input = $input }
  if (Assert-NoUserErrors $r.productSet "create $($p.title)") {
    $id = $r.productSet.product.id
    $createdIds[$p.handle] = $id
    Invoke-Gql $publishMutation @{ id = $id; input = @(@{ publicationId = $onlineStoreId }) } | Out-Null
    Write-Host "  created + published: $($p.title)  (Rs. $($p.price))  [$($p.tags -join ', ')]" -ForegroundColor Green
  }
}

# --- 5. Images --------------------------------------------------------------
Write-Host ""
if ($SkipImages) {
  Write-Host "[5/5] Skipping images (-SkipImages)." -ForegroundColor Yellow
} else {
  Write-Host "[5/5] Uploading product photos from $ImagesRoot..." -ForegroundColor Cyan
  if (-not (Test-Path $ImagesRoot)) { throw "ImagesRoot not found: $ImagesRoot" }

  foreach ($p in $products) {
    if (-not $createdIds.ContainsKey($p.handle)) {
      Write-Host "  - $($p.handle): no product id, skipping" -ForegroundColor Yellow
      continue
    }
    # NB: not $pid — that's a read-only PowerShell automatic variable.
    $productId = $createdIds[$p.handle]

    # Don't double-attach on a re-run.
    $existing = Invoke-Gql 'query($id: ID!) { product(id: $id) { media(first: 50) { nodes { id } } } }' @{ id = $productId }
    if ($existing.product.media.nodes.Count -gt 0) {
      Write-Host "  - $($p.handle): already has $($existing.product.media.nodes.Count) image(s), skipping" -ForegroundColor DarkGray
      continue
    }

    $mediaInput = @()
    foreach ($name in $p.images) {
      $file = Get-Item (Join-Path $ImagesRoot $name) -ErrorAction SilentlyContinue
      if (-not $file) {
        Write-Warning "  $($p.handle): missing image $name"
        continue
      }
      Write-Host "      uploading $name..." -ForegroundColor DarkGray
      $mediaInput += @{
        originalSource   = (Send-StagedUpload $file)
        mediaContentType = "IMAGE"
        alt              = $p.title
      }
    }
    if ($mediaInput.Count -eq 0) { continue }

    $create = Invoke-Gql 'mutation($pid: ID!, $media: [CreateMediaInput!]!) { productCreateMedia(productId: $pid, media: $media) { media { ... on MediaImage { id } } mediaUserErrors { field message } } }' `
      @{ pid = $productId; media = $mediaInput }
    if ($create.productCreateMedia.mediaUserErrors) {
      Write-Warning "  $($p.handle) -> $($create.productCreateMedia.mediaUserErrors | ConvertTo-Json -Compress)"
      continue
    }
    Write-Host "  + $($p.handle): $($mediaInput.Count) image(s) attached" -ForegroundColor Green
  }
}

Write-Host ""
Write-Host "Done. Catalogue rebuilt and published to the Online Store." -ForegroundColor Green
