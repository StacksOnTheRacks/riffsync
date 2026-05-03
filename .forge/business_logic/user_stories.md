# User stories

MVP slice derived from **`vision.json`** + **`README.md`** — prioritized for sequencing.

## P0 — ship shape

| ID | As a… | I want… | So that… |
| --- | --- | --- | --- |
| US-P0-01 | visitor | browse the catalog | I can pick an episode without signing up |
| US-P0-02 | visitor | join a hosted room as a guest | I watch in-app without creating an account |
| US-P0-02b | visitor | try to start my own party unsigned | I’m prompted to **sign in to host** |
| US-P0-03 | signed-in fan | create/open a room from the catalog | I’m room admin with **`hostSub`** binding and a share link |
| US-P0-04 | guest | join via URL / lobby | I watch the same picture and audio the admin shares |
| US-P0-05 | room admin | control the embed and start broadcasting | guests receive my shared stream (after browser permission + guest play taps as needed) |
| US-P0-06 | anyone in room | send chat | we can talk during the episode |
| US-P0-07 | guest | see advisory premium/ad label | I set expectations on ads |
| US-P0-08 | system | sweep stale rooms | lobby does not show dead parties forever |
| US-P0-09 | room admin | browse the catalog from inside the room and switch episodes | the room’s **current** title updates for everyone (metadata + shared stream) without starting a new room URL |

| ID | As a… | I want… | So that… |
| --- | --- | --- | --- |
| US-P1-01 | operator | TMDB-reconciled art/copy | catalog looks good without client-side TMDB |
| US-P1-02 | operator | CloudWatch dashboards | I see health and reconcile outcomes |
| US-P1-03 | fan | federated login (e.g. Facebook) | I can **host** rooms and retain continuity across devices |
| US-P1-04 | operator | admin catalog + lists | I can curate without editing raw JSON in prod |

## Out of scope (MVP)

- Verified YouTube Premium detection
- Server-side video hosting
- CRDT / multi-host democratic control

## Primary code pointers (optional)

- Link GitHub issues when filed.
- **US-P0-01 (browse):** `apps/web` home + `/catalog` load from **`GET /v1/catalog`** when **`VITE_PUBLIC_API_BASE_URL`** is set (**M4 / issue #13**); **US-P0-07 (advisory):** `PlaybackExpectationBadge` + optional `playbackExpectation` on catalog rows (honor-system; see **`README`**).
