# User stories

MVP slice derived from **`vision.json`** + **`README.md`** — prioritized for sequencing.

## P0 — ship shape

| ID | As a… | I want… | So that… |
| --- | --- | --- | --- |
| US-P0-01 | visitor | browse the catalog | I can pick an episode without signing up |
| US-P0-02 | visitor | play episode in embed | I watch in-app with normal YouTube rules |
| US-P0-03 | fan | open an episode / room from catalog | I land on the room page as admin when first in, with a share link |
| US-P0-04 | guest | join via URL / lobby | I watch the same picture and audio the admin shares |
| US-P0-05 | room admin | control the embed and start broadcasting | guests receive my shared stream (after browser permission + guest play taps as needed) |
| US-P0-06 | anyone in room | send chat | we can talk during the episode |
| US-P0-07 | guest | see advisory premium/ad label | I set expectations on ads |
| US-P0-08 | system | sweep stale rooms | lobby does not show dead parties forever |
| US-P0-09 | room admin | browse the catalog from inside the room and switch episodes | the room’s **current** title updates for everyone (metadata + shared stream) without starting a new room URL |
## P1 — operations & polish

| ID | As a… | I want… | So that… |
| --- | --- | --- | --- |
| US-P1-01 | operator | TMDB-reconciled art/copy | catalog looks good without client-side TMDB |
| US-P1-02 | operator | CloudWatch dashboards | I see health and reconcile outcomes |
| US-P1-03 | fan | optional Facebook login | I can keep identity across devices (when shipped) |
| US-P1-04 | operator | admin catalog + lists | I can curate without editing raw JSON in prod |

## Out of scope (MVP)

- Verified YouTube Premium detection
- Server-side video hosting
- CRDT / multi-host democratic control

## Primary code pointers (optional)

- Link GitHub issues when filed.
