# M3 design parity checklist — catalog home (`/`) vs `movies-home.html`

Reference static HTML: `docs/riffsync-design-template/Main File/red-html/movies-home.html`. SPA route: `/` (`apps/web`).

Test at **viewport widths** (browser devtools or window sizing):

| Width | Role |
| ----- | ---- |
| **375** | Mobile |
| **768** | Tablet |
| **1280** | Desktop |

For each width, open **`movies-home.html`** (file or static server) and **`npm run dev`** → `/` with the **same zoom**. Compare the items below.

## Structural / layout

- [ ] Full-bleed **hero** strip under global header (no accidental side gutters on the hero).
- [ ] **Section rhythm**: two titled carousels → **middle spotlight** strip → third titled carousel (order matches reference).
- [ ] **Section titles** use `gen-heading-title` treatment; **“More Videos”** flat button row aligns right on `md+`.
- [ ] **Row carousels**: card grid density roughly matches reference (≈4 / ≈3 / ≈2 / 1 slides across breakpoints).

## Hero & spotlight

- [ ] Hero backgrounds cover slide area; text column readable (left stack: tag line, title, meta list, paragraph, CTAs).
- [ ] Hero **prev/next** controls usable and visible against imagery.
- [ ] Middle **spotlight** uses **pagination dots**; autoplay does not trap focus.

## Cards / chrome

- [ ] Poster/thumbnail aspect and **play** affordance on hover or visible per template behavior.
- [ ] Title + meta line (experiment # + era) readable; typography from template CSS.

## Explicit deferrals (known deltas vs reference HTML)

| Topic | Decision |
| ----- | -------- |
| **Social / like / playlist** hover menus | Omitted on cards — no jQuery plugins; aligns with CSP/hygiene in `docs/architecture.frontend.md`. |
| **Third row title** | Reference: “Powerful Crime Thrillers”; SPA: **“Joel-era experiments”** (catalog-themed). |
| **Owl Carousel** | Replaced with **Swiper** (React); motion/controls may differ slightly. |
| **Analytics / embeds** | None added. |

## Data

- [ ] `/` uses **mock/static** catalog slice from `data/catalog/episodes.json` only (**no** `GET /v1/catalog`).

## Sign-off

| Reviewer | Date | Notes |
| -------- | ---- | ----- |
| | | |
