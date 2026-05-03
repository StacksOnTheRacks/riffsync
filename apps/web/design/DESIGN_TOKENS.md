# Design tokens (red-html → RiffSync web)

Canonical template: `docs/riffsync-design-template/Main File/red-html/`. Static CSS and font assets are mirrored under `apps/web/public/design/` (served as `/design/...`).

## Color & core variables

| Token / variable | Value (template) | Source |
| ---------- | --- | --- |
| `--primary-color` | `#e50916` | `public/design/css/style.css` `:root` |
| `--primarydark-color` | `#b81d24` | same |
| `--black-color` | `#221f1f` | same |
| `--dark-color` | `#161616` | same |
| `--secondary-color` | `#cecfd1` | same |
| `--grey-color` | `#f5f5f1` | same |
| `--white-color` | `#ffffff` | same |
| `--body-fonts` | `'Roboto', sans-serif` | same |
| `--title-fonts` | `'Jost', sans-serif` | same |

Template `:root` is defined at the top of `style.css` (Streamlab **Table of contents → General** section). React shell overrides live in `src/styles/riffsync-app.css`.

## Typography

| Role | Template | Notes |
| ---- | -------- | ----- |
| Body | Roboto | Loaded via Google Fonts `@import` in `style.css` |
| Headings | Jost | same |

## Breakpoints & responsive sheet

| Rule | Condition | Source |
| ---- | --------- | ------ |
| App store badge height | `max-width: 1499px` | `public/design/css/responsive.css` |

Additional `@media` breakpoints for header/footer/layout are embedded throughout `style.css` (e.g. `767px`, `1365px`, `1399px` for navigation). Use **`style.css`** as the reference when adding page-level responsive behavior.

## Asset paths

| URL prefix | Directory |
| ---------- | --------- |
| `/design/css/` | `public/design/css/` |
| `/design/fonts/` | `public/design/fonts/` |
| `/design/images/` | `public/design/images/` |

`ionicons.min.css` references `../fonts/ionicons.svg`; the repo includes `public/design/fonts/ionicons.svg` (copied from the template) so that path resolves.

## React chrome

| Area | Component | HTML landmark / pattern |
| ---- | --------- | ------------------------ |
| Header | `src/components/site/SiteHeader.tsx` | `<header id="gen-header">` — same id/class family as `movies-home.html` |
| Footer | `src/components/site/SiteFooter.tsx` | `<footer id="gen-footer">` |
| Layout | `src/layouts/SiteLayout.tsx` | Wraps routes with `<main id="riffsync-main">` |

Streamlab logo images are **not** used in chrome; the wordmark **RiffSync** replaces vendor branding per product config (`.forge/project.json`).
