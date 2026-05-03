# Catalog data (YouTube library)

This folder defines the **shape** of catalog rows (**`catalog.schema.json`**) and, for **early development**, a **committed JSON seed** (**`episodes.json`**) so you can work without wiring a database yet.

**Target architecture:** **DynamoDB** backing **`GET /v1/catalog`** (see **`docs/architecture.server.md`**) is the **canonical catalog store** (`youtubeVideoId`, display fields, curator hints). Treat **`data/catalog/episodes.json`** as a **bootstrap snapshot** useful for importing into that store, validating in CI against the schema, and reproducing fixtures—not the permanent source of truth.

## Files

| File | Purpose |
| --- | --- |
| `episodes.json` | **Seed bundle** `{ version, updated, entries[] }` — same columns the live store will expose. Migrate or import these rows into your catalog table when you graduate off flat files; keep it in CI as a reproducible starter set if you want. |
| `catalog.schema.json` | JSON Schema for each entry (**validate migrations and API payloads**, not only this file — see CI with `ajv` / tooling). |

## Experiment numbering

The bundled rows use commonly published MST3K ordering: national run after KTMA («No. overall» **22–217** from sources such as Wikipedia) mapped to **`101`+, `201`+, …**, with **Jonah-era** revival as **1101–1114** (season 11) and **1115–1120** (season 12 *Gauntlet*). Maintain that scheme when authoring seed data—or database migrations—so filters and bookmarks stay coherent.

## Adding or changing an episode

When the catalog **database** is live, curators attach YouTube IDs and tweak metadata **there** (or via a CMS that writes the same rows). Optionally **export** to JSON occasionally for snapshots or regression tests—not as the authoritative edit surface.

Until that migration lands, **`episodes.json`** is the practical place to bulk-edit seed data:

1. Use a **stable `id`** slug — never recycle it for a different experiment if links or rooms might reference it.
2. Confirm the upload is **embeddable** in your test app (many uploads block embedding) before setting a non-null `youtubeVideoId`.
3. Set `youtubeVideoId` to the **11-character** id from the watch URL when known; leave `null` for metadata-first rows awaiting a curator mapping.
4. Fill `era` for filters (`joel` \| `mike` \| `jonah` \| `emily` \| `other`). **Convention here:** Joel through experiment **512** (Mitchell), Mike **513** onward through **1313**, Jonah from **1101** (national revival onward).
5. Bump `updated` when you reshuffle seed JSON for reproducibility (`YYYY-MM-DD`).

Example entry shape (mirror this in whatever store you migrate to):


```json
{
  "id": "example-slot",
  "experimentNumber": 421,
  "title": "Replace with curated experiment title",
  "youtubeVideoId": "xxxxxxxxxxx",
  "youtubeWatchUrl": "https://www.youtube.com/watch?v=xxxxxxxxxxx",
  "era": "joel",
  "embedAllows": null,
  "curatorNotes": "Remove illustrative examples from shipped catalog entries."
}
```

Metadata-only catalog rows (`youtubeVideoId`: `null`) are fine for scaffolding grids and TMDB enrichment; omit them from iframe surfaces until uploads are curated.

## Deploy

- **Production (target):** clients read **`GET /v1/catalog`** (or CDN mirroring its output); the HTTP handler merges **canonical rows from your catalog DB** with TMDB-derived image fields from the reconcile job (**`architecture.server.md`**, **`architecture.catalog-images.md`**).
- **Prototyping:** copy **`episodes.json`** into **`public/`** or load it from disk/S3 inside a spike; treat that as temporary—do not confuse it with long-term **`source of truth`** once the DB owns the catalog.
- **Invalidation:** when you publish catalog changes from the DB-backed API (or regenerated enriched snapshots), bump cache **`ETag`**, CDN invalidation, or short TTL accordingly.

## Poster & backdrop art (TMDB)

Scheduled reconciliation resolves each row to a TMDB **movie**, then persists **both**:

- **`poster_path` → card/poster layouts** (**`posterImageUrl`**, raw **`tmdbPosterPath`** in schema),
- **`backdrop_path` → wide heroes / blurred chrome** (**`backdropImageUrl`**, raw **`tmdbBackdropPath`**).

The job **does not** ingest cast **headshots**, company **logos**, or TMDB **`logos`** buckets—only officially keyed **movie poster/backdrop paths**. Details and reconcile steps: **`docs/architecture.catalog-images.md`**; sizing rules: **[TMDB image basics](https://developer.themoviedb.org/docs/image-basics)**.

Curator hints (**`movieSearchTitle`**, **`tmdbMovieId`**, TMDB paths, resolved URLs, **`tmdbArtworkSyncedAt`**) are in **`catalog.schema.json`**. **Do not** commit API keys.

## Rights

Only list videos you’re comfortable pointing at (copyright, embed policy, takedown risk). The repo **disclaimer** in the root `README.md` applies.
