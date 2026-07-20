# Veylique Shopify Theme

Veylique is a custom Shopify Online Store 2.0 theme for an editorial fashion storefront. The theme is built from modular Liquid sections, JSON templates, merchant-editable settings, and a shared CSS foundation.

## Development

Use the pinned Shopify CLI environment in `shopify.theme.toml`.

```powershell
.\scripts\start-dev-server.ps1
```

This starts the local preview and theme editor sync for the configured Veylique development theme.

## Syncing Admin Edits

When content or settings are changed in the Shopify theme editor, pull those remote edits before coding.

```powershell
.\scripts\sync-admin-edits.ps1
```

## Shipping Code Changes

Validate and push local theme code to Shopify.

```powershell
.\scripts\push-code-changes.ps1
```

To also commit and push to `origin/master`:

```powershell
.\scripts\push-code-changes.ps1 -Commit -Message "Your commit message"
```

## CSS Infrastructure

- `snippets/css-variables.liquid` is the canonical design-token source. It maps Shopify theme settings into semantic Veylique tokens for colors, fonts, spacing, radii, focus rings, animation timing, z-index, and layout widths.
- `assets/critical.css` contains reset rules, document defaults, accessibility primitives, and the Shopify section grid utility.
- `assets/veylique-theme.css` contains shared Veylique primitives such as containers, typography helpers, buttons, layout utilities, card contracts, and common global components.
- Section-specific visual systems live in each section's `{% stylesheet %}` block.

## Standards

- Use standard Shopify theme directories only: `assets`, `blocks`, `config`, `layout`, `locales`, `sections`, `snippets`, and `templates`.
- Keep customer-facing text translatable through locale keys.
- Use Shopify `font_picker` settings rather than bundled custom fonts.
- Use `rem` for typography, spacing, radii, and component sizing while keeping `html { font-size: 100%; }`.
- Run `shopify theme check` before pushing theme changes.
