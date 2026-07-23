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
