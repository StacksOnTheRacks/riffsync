# Catalog HTTP API (draft)

Anonymous **`GET`** routes backed by **DynamoDB** (**`architecture.server.md`**). OpenAPI TBD.

## `GET /v1/catalog`

Query parameters:

| Param | Values | Effect |
| --- | --- | --- |
| **`carousel`** | **`true`** or **`1`** | Response **`entries`** only include rows where **`carousel`** is **`true`** in storage (still sorted by **`experimentNumber`**). Omit for the full catalog. |

Returns a bundle aligned with **`data/catalog/episodes.json`**:

| Field | Type | Notes |
| --- | --- | --- |
| **`version`** | `number` | Currently **`1`** (bundle schema version). |
| **`entries`** | `CatalogEpisode[]` | Sorted by **`experimentNumber`** ascending. |

### `CatalogEpisode`

| Field | Type | Notes |
| --- | --- | --- |
| **`id`** | `string` | Stable slug (partition key in DynamoDB). |
| **`experimentNumber`** | `number` | Classic experiment ordering. |
| **`title`** | `string` | Display title (**not** TMDB `title`). |
| **`era`** | string enum | `joel` \| `mike` \| `jonah` \| `emily` \| `other`. |
| **`youtubeVideoId`** | `string \| null` | |
| **`youtubeWatchUrl`** | `string \| null` | |
| **`tagline`** | `string \| null` | Often filled by reconcile. |
| **`posterImageUrl`** | `string \| null` | |
| **`backdropImageUrl`** | `string \| null` | |
| **`tmdbMovieId`** | `number \| null` | |
| **`tmdbArtworkSyncedAt`** | `string \| null` | ISO-8601 when enrichment last wrote artwork/tagline. |
| **`carousel`** | `boolean` | **`true`** when the row is curated for home carousels; omitted in git seed is stored/fetched as **`false`**. |
| **`tmdbOverview`** | `string \| optional` | Present when reconcile persisted copy (**`architecture.catalog-images.md`**). |
| **`tmdbPopularity`** | `number \| optional` | |
| **`tmdbPosterPath`** | `string \| optional` | Raw TMDB path; **`posterImageUrl`** is the resolved CDN URL when set. |
| **`tmdbBackdropPath`** | `string \| optional` | |

Clients should treat optional / **`null`** enrichment fields as “not yet available.”

### Optional SPA hints (not in git schema)

| Field | Type | Notes |
| --- | --- | --- |
| **`embedAllows`** | `boolean` | When **`false`**, SPA should not offer in-app YouTube embed (see **`architecture.frontend.md`**). |
| **`playbackExpectation`** | `"premium"` \| `"ad_supported"` \| `"unknown"` | Honor-system advisory for **US-P0-07**; not verified server-side. |

## `GET /v1/catalog/{id}`

| Field | Type |
| --- | --- |
| **`entry`** | `CatalogEpisode` |

**`404`** when the **`id`** is unknown.

## Infrastructure

- **Table:** **`RiffSyncApi-{staging|prod}`** stack output **`CatalogTableName`** — PK **`id`** (string). No sort key; list route uses **`Scan`** (see **`infra/cdk/README.md`**).
- **Seed:** **`infra/cdk`** → **`npm run seed:catalog -- <CatalogTableName>`** after deploy (validates against **`catalog.schema.json`**).
