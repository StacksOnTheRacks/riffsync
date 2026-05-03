# Catalog HTTP API (draft)

Anonymous **`GET`** routes backed by **DynamoDB** (**`architecture.server.md`**). OpenAPI TBD.

## `GET /v1/catalog`

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
| **`tmdbOverview`** | `string \| optional` | Present when reconcile persisted copy (**`architecture.catalog-images.md`**). |
| **`tmdbPopularity`** | `number \| optional` | |
| **`tmdbPosterPath`** | `string \| optional` | Raw TMDB path; **`posterImageUrl`** is the resolved CDN URL when set. |
| **`tmdbBackdropPath`** | `string \| optional` | |

Clients should treat optional / **`null`** enrichment fields as “not yet available.”

## `GET /v1/catalog/{id}`

| Field | Type |
| --- | --- |
| **`entry`** | `CatalogEpisode` |

**`404`** when the **`id`** is unknown.

## Infrastructure

- **Table:** **`RiffSyncApi-{staging|prod}`** stack output **`CatalogTableName`** — PK **`id`** (string). No sort key; list route uses **`Scan`** (see **`infra/cdk/README.md`**).
- **Seed:** **`infra/cdk`** → **`npm run seed:catalog -- <CatalogTableName>`** after deploy (validates against **`catalog.schema.json`**).
