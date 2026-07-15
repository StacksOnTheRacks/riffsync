# Public Site SEO

## Introduction

RiffSync's public catalog and marketing surfaces — home, catalog, episode watch pages, host-help, and legal pages — are discoverable by search engines and shareable with rich social previews (Discord, Reddit, Mastodon, and similar unfurlers), without changing the SPA's existing visual design and without extending discoverability to live, ephemeral room state.

**Audience:** fans searching for riff-style watch parties and episode discovery; community sharers posting catalog and watch links.

**Related capability:** `viewer-local-cast` (separate optional per-viewer presentation layer; not part of this capability).

**Non-goals:** indexing `/room/*` or `/lobby`; a server-side rendering framework migration; CloudFront-based bot-detection or edge compute for dynamic rendering; dedicated per-era catalog routes (`/catalog` remains the single canonical catalog entry).

## Functional Specification

### Indexable vs noindex route matrix

| Indexable | `noindex` |
| --- | --- |
| `/`, `/catalog`, `/watch/:catalogEpisodeId`, `/how-to-host-a-watchparty`, `/terms`, `/privacy` | `/room/:roomId` (+ `/room/:roomId/experimental/:experimental`), `/lobby`, `/account`, `/admin/*`, `/cast/receiver`, `/privacy/data-removal`, `/auth/callback`, `/admin/auth/callback` |

`/watch/:catalogEpisodeId` is indexable only for episodes with a live YouTube link (the existing `episodeHasYoutubeLink` filter) — an episode without a lawful embed carries no surface worth summarizing or linking to and is excluded from indexing and the sitemap until a link exists.

### Per-route head tags

Each indexable route gets a unique `<title>`, meta description, canonical `<link>`, and Open Graph/Twitter tags, replacing today's single static `index.html` shell applied to every route. `/watch/:catalogEpisodeId` sources title/description/OG from the catalog `title` field (never TMDB `title`/`original_title`) plus `tagline`, `posterImageUrl`, and `backdropImageUrl` when present. All other routes carry the generic app-shell title/description plus a `noindex` robots meta tag — no per-instance head tags. Full per-route table: `.ai/interface/presentation.md` → *Public site head tags and heading semantics*.

### `robots.txt` and `sitemap.xml`

Both are build-time-generated artifacts reflecting the current catalog, not hand-maintained static files. `robots.txt` disallows ephemeral/authenticated/receiver-only paths and allows the indexable set; it publishes a `Sitemap:` line pointing at `sitemap.xml`. `sitemap.xml` enumerates the static indexable routes plus one `<url>` entry per YouTube-linked catalog episode. Full policy table: `.ai/operations/build_packaging.md` → *Public site SEO artifacts*.

### Build-time prerender

A build step renders static HTML snapshots for each indexable route into `dist/` alongside the SPA shell. Crawlers and unfurlers that do not execute JavaScript receive meaningful HTML; users still get the interactive React SPA. No CloudFront Function or Lambda@Edge bot-detection is introduced — the artifact ships through the existing S3 + CloudFront static pipeline with no new edge compute surface.

### Canonical hostname alignment

The canonical production origin is the apex hostname `https://riffsync.tv`. Non-canonical `https://www.riffsync.tv` redirects to apex at the edge, preserving path and query. Every absolute URL this capability produces — canonical `<link>`, sitemap entries, OG/Twitter `url`/`image` — uses apex; none emit `www`.

### Home heading and catalog image accessibility

`/` gets a static, visually-hidden (`sr-only`) `<h1>` ahead of the hero banner — no visible layout change to the hero, carousel, or spotlight banner. Catalog card images get non-empty `alt` text describing the episode. `/watch/:catalogEpisodeId`'s existing `sr-only` `<h1>{episode.title}</h1>` is unchanged.

### Search Console verification

Search Console / Bing Webmaster verification uses a DNS TXT record on the existing Route 53 hosted zone already managing `riffsync.tv` — not an HTML file upload or meta-tag step.

## Technical Specification

**Stack:** `apps/web` — React 19.2, Vite 8, react-router-dom 7, single Vite build (`npm run build` → `dist/`) published to the `RiffSyncStatic-prod` private S3 + CloudFront (OAC) origin via the existing GitHub Actions `deploy-prod.yml` pipeline (Node/CI toolchain per `.ai/operations/build_packaging.md`).

**Build pipeline:** the SEO artifact generation (robots/sitemap/prerender/head-tags) is a new step inside the existing `apps/web` `npm run build` invocation — not a second build pipeline, not a new CI job. Sitemap and robots generation reads `data/catalog/episodes.json` (or `GET /v1/catalog`) filtered by the existing `episodeHasYoutubeLink` predicate (`apps/web/src/catalog/mockCatalog.ts`).

**Canonical origin sourcing:** the same `public_domain` / `PUBLIC_WEB_ORIGIN` build-time value already used for `VITE_PUBLIC_ORIGIN` (`.ai/runtime/configuration.md`) is the single source for all absolute URLs this capability emits.

**Canonical hostname redirect:** the existing `fanWebCanonicalHostname` CDK context on `RiffSyncStatic-prod` (`infra/cdk/lib/static-site-stack.ts`) drives the existing `cloudfront-canonical-redirect.ts` CloudFront Function, which 301-redirects any configured `fanWebAlternateDomainNames` (including `www.riffsync.tv`) to the canonical apex host. No new CDK construct is required — only ensuring the context value is set to apex.

**Publish target:** artifacts ship through the existing `apps/web` → `RiffSyncStatic-prod` S3 sync + CloudFront invalidation (`deploy-prod.yml` phase 5). No new stack, no new environment tier, no hosted staging footprint.

**Search Console verification:** a DNS TXT record added to the existing Route 53 hosted zone (`fanWebZoneName`) already managed in `static-site-stack.ts`.

## Testing Strategy

**Unit/component:** home `sr-only` H1 renders exactly once; catalog card `alt` text is non-empty; the per-route head-tag generator produces the expected title/description/canonical/OG for each indexable route, including `/watch/:id` cases with and without `tagline`/poster art.

**Build/CI:** the `web-app` CI job asserts `robots.txt`, `sitemap.xml`, and prerendered HTML exist for each indexable route after `npm run build`; sitemap entry count matches the count of catalog episodes passing `episodeHasYoutubeLink`; the build fails rather than shipping an empty or stale sitemap when catalog data is unavailable.

**Manual/smoke (post-deploy, production only):** apex canonical reachable; `www` → apex redirect returns a 3xx to the apex host; `robots.txt`/`sitemap.xml` return 200; the canonical `<link>` on `/` and a sample `/watch/:id` matches apex; Search Console DNS verification confirmed. Peer prior art for the smoke-check shape: `control9/control9-www`'s `smoke-production.mjs` (reference only — riffsync's static-hosting shape differs enough that it is not a template to copy wholesale).

## References

- `.ai/business_logic/domain_model.md` — Public discoverable surface, Invariant 1 (lawful playback), Invariant 9 (catalog title), Invariant 11 (public discoverability boundary)
- `.ai/business_logic/user_stories.md` — US-P1-08, US-P1-09
- `.ai/interface/presentation.md` — Public site head tags and heading semantics
- `.ai/interface/accessibility.md` — Public catalog and marketing surfaces
- `.ai/operations/build_packaging.md` — Public site SEO artifacts
- `.ai/operations/deployment_environments.md` — Public site SEO deployment readiness
- `.ai/runtime/configuration.md` — Public hostname, Public site SEO build-time config
