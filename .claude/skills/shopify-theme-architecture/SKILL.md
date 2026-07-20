---
name: shopify-theme-architecture
description: Authoritative rules and pre-flight checklists for building Shopify Online Store 2.0 themes without architectural mistakes. Covers directory structure, layouts, templates, sections, blocks, snippets, settings/config, locales, the {% javascript %}/{% stylesheet %} tags, performance budgets, and accessibility. Use BEFORE creating or editing any .liquid/.json theme file, when adding a section/block/snippet/template, when writing a {% schema %}, or when auditing a theme. Distilled from shopify.dev/docs/storefronts/themes/architecture.
---

# Shopify Theme Architecture — Build Rules & Audit Checklist

Follow these rules when creating or editing any theme file. Each `❌`/`✅` pair is a concrete
mistake to avoid. Rules marked **[BREAKS]** produce an unsaveable file, a failed
`shopify theme check`, or a page that will not render.

---

## 0. Golden rules (read first)

1. **CSS-first, JS-enhances.** JavaScript must never be required for basic shopping, navigation,
   or content access. Everything core must work with JS disabled.
2. **Merchant-editable by default.** Prefer JSON templates + sections + blocks with `presets` over
   static/hardcoded content, so merchants can add/remove/reorder without touching code.
3. **One responsibility per file, one schema per file.** One `{% schema %}`, one `{% javascript %}`,
   one `{% stylesheet %}` per section/block/snippet — more than one **[BREAKS]**.
4. **Run `shopify theme check` before every push.** It catches subsetting issues, oversized bundles,
   parser-blocking scripts, unused assets, and schema errors.
5. **No Liquid inside `{% javascript %}` or `{% stylesheet %}` tags** — it is not rendered and can
   **[BREAK]** the bundle. Pass dynamic values via `data-*` attributes or inline `<style>`.

---

## 1. Directory structure & file rules

Only these top-level directories are supported — **no other subdirectories** (except
`templates/customers/` and `templates/metaobject/`):

```
assets/  blocks/  config/  layout/  locales/  sections/  snippets/  templates/
```

- **Minimum viable theme** = `layout/theme.liquid`. Everything else is optional but expected.
- **JSON comments / trailing commas** are allowed **only** in `config/settings_schema.json`.
  They do **not** persist in templates, section files, `settings_data.json`, or locale JSON — do
  not add them there.
- Asset files can use Liquid by appending `.liquid` (`styles.css.liquid`) — but prefer the
  `{% stylesheet %}`/`{% javascript %}` tags or plain assets + `asset_url`.
- **All static assets belong in `/assets`** so they are served from the Shopify CDN. Reference them
  with `asset_url` — never hotlink remote hosts.

**Hard limits**
| Thing | Limit |
|---|---|
| JSON templates (all types) | 1,000 per theme |
| Sections per JSON template / section group | 25 |
| Blocks per section | 50 (override down with `max_blocks`) |
| Translations per locale file | 3,400 |
| Translation value length | 1,000 chars |
| Minified theme JS bundle (Theme Store) | ≤ 16 KB |
| Preloaded resources per template | ≤ 2 |

---

## 2. Layout (`layout/theme.liquid`)

- **[BREAKS]** `{{ content_for_header }}` **must** be in `<head>`. Omitting it makes the file
  unsaveable. Never modify, parse, or wrap its output.
- **[BREAKS]** `{{ content_for_layout }}` **must** be between `<body>` tags. Omitting it makes the
  file unsaveable.
- Set `<html lang="{{ request.locale.iso_code }}">` for screen readers.
- Add a template body class for CSS targeting: `<body class="template-{{ template.name }}">`.
- Render section groups with `{% sections 'header-group' %}` / `{% sections 'footer-group' %}`.
- Alternate layouts: JSON templates use the `layout` schema attribute; Liquid templates use the
  `{% layout 'name' %}` tag. `theme.liquid` is the default.
- Checkout layouts are Plus-only and deprecated for Thank-You/Order-Status as of 2025-08-28 — do
  not build there.

---

## 3. Templates (`templates/`)

- **Prefer JSON templates.** They contain **only** section references — **[BREAKS]** if you put raw
  HTML/Liquid directly in a `.json` template. All markup must live in a section.
- **Must be `.liquid` (never JSON):** `gift_card`, `robots.txt`, `agents.md`, `llms.txt`,
  `llms-full.txt`.
- Valid types: `404, article, blog, cart, collection, gift_card, index, list-collections, page,
  password, product, search, metaobject` (+ the liquid-only ones above). A missing template = that
  page type won't render.
- **Alternate templates:** `type.suffix.json` (e.g. `product.wholesale.json`). The suffix is
  merchant-chosen; you **cannot** override the default. Assigned in admin, theme editor, or
  `?view=suffix`. Use dot-separated names, no spaces/special chars.
- Product templates should expose the `product` object and a product form (`{% form 'product' %}`)
  so add-to-cart works.
- Legacy customer-account templates are deprecated — use the `<shopify-account>` web component.

---

## 4. Sections (`sections/`)

- **[BREAKS]** Every section needs exactly one `{% schema %}` (valid JSON, not nested inside another
  tag, no rendered Liquid inside).
- **Presets make a section addable in the theme editor.** No preset ⇒ merchant can't add/remove it;
  it must be placed manually in a JSON template.
- **Static rendering** `{% section 'name' %}` = one shared instance, not reorderable, settings apply
  globally. Prefer **dynamic** (JSON template / section group) rendering.
- Scope: sections see global objects + the `section` and `block` objects. Variables created
  **outside** a section are **not** visible inside it (and vice-versa). Only exception: a snippet
  rendered inside the section can see the section's objects.
- **Theme-editor lifecycle:** on dynamic section/block re-render, load-time JS does **not** re-run.
  Listen for `shopify:section:load/unload/select`, `shopify:block:select/deselect` on the document
  to re-init and to keep the selected section/block visible (pause carousels, scroll into view).

### 4a. `{% schema %}` attribute reference
| Attribute | Rules |
|---|---|
| `name` | **Required.** Editor title. |
| `tag` | Wrapper element. Only `article, aside, div, footer, header, section`. **[BREAKS]** `span`/`p`. Default `div`. Shopify adds `id="shopify-section-*"` + `.shopify-section`. |
| `class` | Extra classes appended to the wrapper. |
| `limit` | `1` or `2` only. Default unlimited. |
| `settings` | Array; **all `id`s unique within the section.** |
| `blocks` | Either local blocks **or** theme/app blocks (`@theme`,`@app`) — **not both.** Each local block needs unique `type` + `name`. |
| `max_blocks` | ≤ 50. Static blocks don't count. |
| `presets` | `name` required; optional `category`, `settings`, `blocks`. Shown in "Add section". |
| `default` | For **statically** rendered sections (use instead of `presets`). |
| `locales` | Section-scoped translations, read via `t`. |
| `enabled_on` / `disabled_on` | **[BREAKS]** mutually exclusive — never both. Values: template names or `["*"]`; groups `header/footer/aside/custom.<name>`. |

**Never rely on literal/hardcoded block IDs** — they are generated and change. Loop
`section.blocks`, render `{{ block.shopify_attributes }}` on each block's root element.

Dynamic block title in the editor comes from setting `id` precedence: `heading` → `title` →
`text`, else the block `name`.

---

## 5. Theme blocks (`blocks/`)

- One `.liquid` file per block in `/blocks`. Needs a `{% schema %}` with `name`; needs `presets` to
  appear in the block picker.
- Add `{% doc %}` (LiquidDoc) header when the block is statically rendered via
  `{% content_for 'block', type: '…', id: '…' %}`.
- Reusable across sections; can nest other theme/app blocks (`"blocks": [{ "type": "@theme" }]`) and
  render children with `{% content_for 'blocks' %}`.
- A block **cannot** access variables created outside it or receive passed variables — only
  `block`, `section`, and globals. (This is why reusable render-with-params logic goes in a
  **snippet**, not a block.)
- Settings read via `block.settings.<id>`; each setting needs `type`, `id`, `label`.

---

## 6. Snippets (`snippets/`)

- Rendered with `{% render 'name', param: value %}`. **Use `render`, never `include`** (deprecated;
  leaks scope).
- Snippets are **scope-isolated**: they see globals + explicitly-passed params only. Variables made
  inside don't leak out. Passing an undefined outer variable ⇒ undefined behavior.
- **Every snippet must open with a `{% doc %}` LiquidDoc header** documenting `@param {type} [name]`
  and an `@example`. Optional params in `[brackets]`.
- Snippets are the right home for reusable, parameterized markup (product card, responsive image,
  money, icons).

---

## 7. Config & settings (`config/`, input settings)

- `settings_schema.json` (required) defines global settings + `theme_info` (name, version, author,
  docs/support URLs). `settings_data.json` (required) stores saved values. IDs must match.
- **Every input setting needs `type`, `id`, `label`.** IDs unique within their scope.
- **Type-specific gotchas (common `theme check` failures):**
  - `range`: `min`,`max`,`step`,`default` must be **numbers, not strings**; `default` required.
  - `font_picker`: `default` **required** (e.g. `"assistant_n4"`); missing ⇒ error.
  - `richtext`: `default` **must** be wrapped in top-level `<p>` or `<ul>`; otherwise error.
  - `inline_richtext`: no `<br>`/line breaks.
  - `color_scheme`: returns nil unless a `color_scheme_group` exists; only one group, in
    `settings_schema.json`.
  - `color_palette` / `color_background`: hex without alpha; `color_background` has no image props.
  - Resource pickers (`product, collection, blog, page, article, video, image_picker`) have **no
    `default`** and are **not** carried over when switching presets.
  - `*_list` pickers (`product_list, collection_list, article_list, metaobject_list`): `limit` ≤ 50.
  - `metaobject*`: `metaobject_type` required; Theme Store themes only use standard definitions.
  - `placeholder` on `text`/`textarea` works only in `settings_schema.json`, not section schemas.
- Use `visible_if: "{{ … }}"` to conditionally show settings and reduce editor clutter.
- Sidebar-only elements: `header` and `paragraph` (no `id`/value).

---

## 8. Locales & i18n (`locales/`)

- **All customer-facing and editor text goes through translations.** Hardcoded UI strings are a
  `theme check` smell and block localization.
- Two file kinds: **storefront** `*.json` (rendered text, `{{ 'a.b.c' | t }}`) and **schema**
  `*.schema.json` (editor labels, `"t:a.b.c"`). One `*.default.json` of each is required
  (`en.default.json`, `en.default.schema.json`).
- IETF names: `en-GB.json`, `fr.json`. Keep keys hierarchical (≤ 3 levels), `snake_case`.
- Interpolate with variables: `{{ 'x.y' | t: name: value }}`; pluralize via
  `t: count: n` + `one`/`other` keys. Sentence case for UI copy.

---

## 9. CSS / JS delivery & performance

- `{% stylesheet %}` bundles → `styles.css`; `{% javascript %}` bundles → `scripts.js` /
  `block-scripts.js` / `snippet-scripts.js`, injected via `content_for_header`, JS deferred, CSS
  **subset per render tree**.
- **[BREAKS subsetting]** A `{% stylesheet %}` block must be self-contained — no rule may depend on
  a selector defined in another file's stylesheet block. Cross-file CSS dependencies break when
  Shopify drops unused files. Keep a section's styles in that section.
- Only **one** `{% javascript %}` and one `{% stylesheet %}` per file.
- Instance-specific styling ⇒ inline `<style>` or a CSS var on the element
  (`style="--gap: {{ x }}px"`); instance-specific JS ⇒ `data-*` attribute read by the bundle.
- **Two valid JS delivery methods (both doc-sanctioned):** (a) per-section `{% javascript %}` →
  bundled + subset per page; (b) a shared file in `/assets` loaded once in the layout via
  `asset_url | script_tag` / `<script defer>` — explicitly fine "when assets already load in parent
  layouts." A single theme-wide behavior file is method (b), not a violation.
- **Performance budget applies to *Theme Store submissions*:** Lighthouse ≥ 60 (weighted
  home/product/collection) and **minified JS ≤ 16 KB** are Theme-Store gates — not hard rules for a
  custom/one-merchant theme. Regardless of method: no React/Vue/Angular/jQuery; wrap injected JS in
  an IIFE; `defer`/`async` every script; re-init on `shopify:section:load`; preload ≤ 2 critical
  resources per template.
- Images: use the `image_tag` filter (auto `srcset` + focal-point `object-position`); `loading:
  'lazy'` for below-the-fold; do all heavy Liquid work outside loops.

---

## 10. Accessibility (required for Theme Store & good practice)

- Visible-on-focus **skip link** to `#MainContent`; main container has `tabindex="-1"`.
- Semantic HTML: one `<h1>`, sequential headings (not for styling), `<nav>` for nav, `<a>` for
  links / `<button>` for actions. Validate with the W3 checker.
- ARIA: `aria-current` (current page), `aria-expanded` + `aria-controls` (disclosure/menus),
  `aria-live` (dynamic updates), `aria-describedby` (input → error). **Avoid** `role="menu"` for
  site nav and positive `tabindex`/`autofocus`.
- Focus: visible ring on all interactive elements; DOM = focus order; return focus to the trigger
  when a modal/dropdown closes on Esc; support Tab/Shift-Tab/Enter/Space/Esc.
- Images: descriptive `alt`; decorative → `alt=""`.
- Contrast: 4.5:1 body text, 3:1 large text/icons/borders. Never convey meaning by color alone.
- Forms: every field labeled (`<label for>`/`aria-label`/visually-hidden); `required` +
  `autocomplete`; announce errors via `aria-live`.
- Media: no autoplay (or muted + captions); native controls; allow zoom (never
  `user-scalable=no`/`maximum-scale`).
- Honor `prefers-reduced-motion`; ≥ 44×44px touch targets for primary controls.

---

## 11. Pre-flight checklist (run before committing/pushing)

- [ ] `shopify theme check` passes (no errors).
- [ ] Each new/edited section & block: exactly one `{% schema %}`, valid JSON, unique setting IDs.
- [ ] Sections/blocks that should be merchant-addable have `presets`.
- [ ] No raw HTML/Liquid in any `.json` template; markup lives in sections.
- [ ] No hardcoded block IDs; `{{ block.shopify_attributes }}` on every block root.
- [ ] One `{% javascript %}` / one `{% stylesheet %}` per file; **no Liquid inside them.**
- [ ] Section CSS is self-contained (subsetting-safe); shared primitives in the theme-wide CSS.
- [ ] All UI text via `t` / `t:` keys; new keys added to `en.default(.schema).json`.
- [ ] `range`/`number` defaults numeric; `font_picker`/`range` have required `default`; `richtext`
      defaults wrapped in `<p>`/`<ul>`.
- [ ] `enabled_on` xor `disabled_on` (never both).
- [ ] Assets in `/assets` + `asset_url` (no remote hosts); images use `image_tag` + lazy loading.
- [ ] JS wrapped in IIFE, deferred, and re-inits on `shopify:section:load`; core UX works with JS off.
- [ ] Skip link, one `<h1>`, labeled forms, visible focus, `prefers-reduced-motion` respected.
- [ ] `theme.liquid` still has `content_for_header` (in head) and `content_for_layout` (in body).
