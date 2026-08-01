# Veylique theme scripts

The live **Veylique** theme is connected to this repo's `master` branch through
Shopify's **GitHub integration**. That branch is the **single source of truth**.

## The one rule

> Edit **code** locally, edit **design/content** in the Shopify admin, and ship
> with `deploy.ps1`. **Never run `shopify theme push`** on the connected theme —
> it fights the GitHub sync and can wipe admin edits.

## How the sync works

- You push code to `master` → **Shopify auto-deploys** it to the theme.
- A merchant edits design in the theme editor → **Shopify auto-commits** those
  changes back to `master`.

Because both directions land in git, code and design stay aligned as long as you
pull before you start local work.

## Scripts

### `deploy.ps1` — ship your changes

```powershell
.\scripts\deploy.ps1 -Message "Describe your change"
```

Runs Theme Check → commits your code → `git pull --rebase` (grabs any admin
edits Shopify committed) → `git push`. Shopify deploys from `master` shortly
after.

Flags:
- `-SkipThemeCheck` — skip validation.

If the rebase reports a conflict, resolve the files, then:
```powershell
git rebase --continue
git push origin master
```

### `seed-catalogue.ps1` — rebuild the demo catalogue

```powershell
.\scripts\seed-catalogue.ps1
```

Wipes every product except `graphite-leather-bomber` / `cobalt-oversized-blazer`,
creates the 10 current-season products (Size variants, INR prices, copy, tags),
syncs the six category smart collections the home page is wired to
(Outerwear, Dresses, Tailoring, Knitwear, Women, Men) and uploads the three
photos per product from `assets/latest-product-images/`.

Idempotent — re-running skips what already exists.

Flags:
- `-SkipDelete` — additive run; leave existing products alone.
- `-SkipImages` — products and collections only.
- `-Force` — delete and recreate the 10 products from scratch.

Prereq (once): `shopify store auth --store veylique-development.myshopify.com --scopes write_products,read_products,write_publications,read_publications,write_files`

> The source photos live in `assets/latest-product-images/` but are
> **gitignored**: `assets/` is flat in a Shopify theme, so a subfolder there
> would break the GitHub sync. They're served from the Shopify CDN as product
> media, not as theme assets.

### `start-dev-server.ps1` — local preview

```powershell
.\scripts\start-dev-server.ps1
```

Runs `shopify theme dev` for a live local preview. Read-only-friendly; does not
publish. Stop with `Ctrl+C`.

## Before you start local work

Always sync down first so you have any admin edits Shopify committed:

```powershell
git pull --rebase origin master
```
