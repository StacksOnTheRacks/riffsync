# Catalog data (YouTube library)

This folder defines the **shape** of catalog rows (**`catalog.schema.json`**) and, for **early development**, a **committed JSON seed** (**`episodes.json`**) so you can work without wiring a database yet.

**Target architecture:** **DynamoDB** backing **`GET /v1/catalog`** (see **`docs/architecture.server.md`**) is the **canonical catalog store**. Treat **`data/catalog/episodes.json`** as a **bootstrap snapshot** matching **`catalog.schema.json`**, useful for import, CI validation (e.g. `ajv`), and fixtures—not the permanent source of truth.

**Committed seed rows** only carry the episode fields validated by this schema (`catalog`, `tags`, `labels`, `tagline`, resolved image URLs, `tmdbMovieId`, sync stamp, plus YouTube fields). **Production** Dynamo items may later include additional reconcile-only columns (synopsis, popularity) documented in **`docs/architecture.catalog-images.md`** without changing the slim git seed unless you widen the schema deliberately.

## Files

| File | Purpose |
| --- | --- |
| `episodes.json` | **Seed bundle** `{ version, updated, entries[] }` — every **`entries[]`** object uses the **same property set** (see schema). Migrate or import into your catalog table when you graduate off flat files; gate CI on schema validation when convenient. |
| `catalog.schema.json` | JSON Schema for each entry (**validate migrations and API payloads**, not only this file — see CI with `ajv` / tooling). |

## Experiment numbering

The bundled rows use commonly published MST3K ordering: national run after KTMA («No. overall» **22–217** from sources such as Wikipedia) mapped to **`101`+, `201`+, …**, with **Jonah-era** revival as **1101–1114** (season 11) and **1115–1120** (season 12 *Gauntlet*). Maintain that scheme when authoring seed data—or database migrations—so filters and bookmarks stay coherent.

## Adding or changing an episode

When the catalog **database** is live, curators attach YouTube IDs and tweak metadata **there** (or via a CMS that writes the same rows). Optionally **export** to JSON occasionally for snapshots or regression tests—not as the authoritative edit surface.

Until that migration lands, **`episodes.json`** is the practical place to bulk-edit seed data:

1. Use a **stable `id`** slug — never recycle it for a different experiment if links or rooms might reference it.
2. Confirm the upload is **embeddable** in your test app (many uploads block embedding) before setting a non-null `youtubeVideoId`.
3. Set `youtubeVideoId` to the **11-character** id from the watch URL when known; leave `null` for metadata-first rows awaiting a curator mapping.
4. Fill `catalog` for top-level pages (`mst3k` \| `community` \| `riff_material` \| `movie_night` \| `other`). Public catalog UI omits **`other`**; use **`other`** only as a staff staging bucket while recategorizing rows.
5. Use `tags` for search/filter metadata such as **`Era: Joel`**, **`Genre: Comedy`**, or **`Season: 3`**. Use `labels` for short badges displayed on catalog cards.
6. Bump **`updated`** on the seed bundle (`YYYY-MM-DD`) when you ship a coordinated seed edit.
7. **`youtubeWatchUrl`** is explicitly nullable; pairing it with **`youtubeVideoId`** is strongly recommended whenever the id is set (typically `https://www.youtube.com/watch?v=<11-char-id>`).

**Required shape:** catalog taxonomy fields are **always keys on every row**. Use empty arrays for **`tags`** and **`labels`** when none apply.

Example entry (**all keys**, nullable post-**`catalog`** fields shown):


```json
{
  "id": "example-slot",
  "experimentNumber": 421,
  "title": "Replace with curated experiment title",
  "catalog": "mst3k",
  "tags": ["Era: Joel"],
  "labels": ["Joel"],
  "youtubeVideoId": "xxxxxxxxxxx",
  "youtubeWatchUrl": "https://www.youtube.com/watch?v=xxxxxxxxxxx",
  "tagline": null,
  "posterImageUrl": null,
  "backdropImageUrl": null,
  "tmdbMovieId": null,
  "tmdbArtworkSyncedAt": null
}
```

Metadata-first rows (**`youtubeVideoId`**: `null`, **`youtubeWatchUrl`**: `null`) still carry the TMDB-aligned keys as **`null`** until enrichment; omit them from iframe surfaces until uploads are curated.

## Deploy

- **Production (target):** clients read **`GET /v1/catalog`** (or CDN mirror); reconcile fills **`tagline`**, **`posterImageUrl`**, **`backdropImageUrl`**, **`tmdbMovieId`**, **`tmdbArtworkSyncedAt`** (and may persist extra Dynamo-only copy fields per **`architecture.server.md`**, **`architecture.catalog-images.md`**).
- **Prototyping:** copy **`episodes.json`** into **`public/`** or load it from disk/S3 inside a spike; treat that as temporary—do not confuse it with long-term **`source of truth`** once the DB owns the catalog.
- **Invalidation:** when you publish catalog changes from the DB-backed API (or regenerated enriched snapshots), bump cache **`ETag`**, CDN invalidation, or short TTL accordingly.

## TMDB movie enrichment

Scheduled reconciliation resolves each row’s underlying film (**`GET /movie/{id}`**) and, for rows represented in **`episodes.json`**, persists at least:

- **`tagline`** — film tagline when TMDB exposes one.
- **`posterImageUrl` / `backdropImageUrl`** — resolved HTTPS CDN URLs ( **`docs/contracts.tmdb.md`** — **`secure_base_url` + size + `file_path`**); reconcile flow **`docs/architecture.catalog-images.md`**, upstream **[TMDB image basics](https://developer.themoviedb.org/docs/image-basics)**.
- **`tmdbMovieId`** — committed movie id pin.
- **`tmdbArtworkSyncedAt`** — UTC **`date-time`** for the reconcile write that refreshed the above.

The reconcile job **may** additionally store synopsis, popularity, and raw TMDB paths on **Dynamo** without round-tripping them into this slim git seed; field inventory for the service layer stays in **`docs/architecture.catalog-images.md`**.

**Exact column contract** for the committed catalog bundle is **`catalog.schema.json`** only — **Do not** commit API keys.

## Rights

Only list videos you’re comfortable pointing at (copyright, embed policy, takedown risk). The repo **disclaimer** in the root `README.md` applies.
